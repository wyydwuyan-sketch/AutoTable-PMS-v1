from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..access_helpers import _audit_cross_tenant_access, _ensure_table_access, _ensure_view_exists
from ..auth import get_current_tenant, get_current_user, write_audit_log
from ..constants import DEFAULT_VIEW_CONFIG
from ..db import get_db
from ..models import BaseModel, FieldModel, MembershipModel, RecordModel, TableModel, TablePermissionModel, TenantModel, TenantRoleModel, UserModel, ViewFolderModel, ViewModel, ViewPermissionModel
from ..schemas import (
    CreateRecordIn,
    FieldCreateIn,
    FieldOut,
    ImportViewBundleIn,
    ImportViewBundleLegacyIn,
    ImportViewBundleOut,
    RecordPatchIn,
    RecordOut,
    RecordPageOut,
    RecordQueryIn,
    ReferenceMemberOut,
    TableCatalogOut,
    TableCreateIn,
    TablePatchIn,
    TableReorderIn,
    ViewConfig,
    ViewCatalogItemOut,
    ViewCatalogOut,
    ViewCreateIn,
    ViewFolderCatalogOut,
    ViewFolderCreateIn,
    ViewFolderOut,
    ViewFolderPatchIn,
    ViewFolderReorderIn,
    ViewOut,
    ViewPatchIn,
)
from ..services import (
    apply_filters_and_sorts,
    build_record_filter_clause,
    now_utc_naive,
    serialize_record,
    to_field_out,
    to_view_out,
    upsert_record_values,
)
from ..tenant_helpers import _ensure_manage_table_permissions_allowed, _get_membership_role, _next_id

router = APIRouter()

_VIEW_TYPE_ORDER = {
    "grid": 0,
    "kanban": 1,
    "dashboard": 2,
    "calendar": 3,
    "gantt": 4,
    "form": 5,
}


def _view_sort_key(view: ViewModel) -> tuple[int, int, int, str]:
    config = view.config_json or {}
    role_priority = 0 if (view.view_role or "primary") == "primary" else 1
    return (
        role_priority,
        int(config.get("order", 0)),
        _VIEW_TYPE_ORDER.get(view.type, 99),
        view.id,
    )


def _sort_views_for_catalog(views: list[ViewModel]) -> list[ViewModel]:
    return sorted(views, key=_view_sort_key)


def _find_pending_table_permission(
    db: Session,
    tenant_id: str,
    table_id: str,
    user_id: str,
) -> TablePermissionModel | None:
    # Creating a table can enqueue role defaults and an explicit creator grant in one transaction.
    # Check pending inserts before hitting the database so we do not create duplicate rows pre-flush.
    for item in db.new:
        if not isinstance(item, TablePermissionModel):
            continue
        if item.tenant_id == tenant_id and item.table_id == table_id and item.user_id == user_id:
            return item
    return None


def _find_pending_view_permission(
    db: Session,
    tenant_id: str,
    view_id: str,
    user_id: str,
) -> ViewPermissionModel | None:
    # Keep the view-side guard symmetrical with table permissions for default-view creation.
    for item in db.new:
        if not isinstance(item, ViewPermissionModel):
            continue
        if item.tenant_id == tenant_id and item.view_id == view_id and item.user_id == user_id:
            return item
    return None


def _mirror_table_permissions_to_view(db: Session, tenant_id: str, table_id: str, view_id: str) -> None:
    table_permissions = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    for permission in table_permissions:
        existing = db.scalar(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant_id,
                ViewPermissionModel.view_id == view_id,
                ViewPermissionModel.user_id == permission.user_id,
            )
        )
        if existing:
            continue
        db.add(
            ViewPermissionModel(
                tenant_id=tenant_id,
                view_id=view_id,
                user_id=permission.user_id,
                can_read=bool(permission.can_read or permission.can_write),
                can_write=bool(permission.can_write),
                created_at=now_utc_naive(),
            )
        )


def _ensure_direct_view_permission(db: Session, tenant_id: str, view_id: str, user_id: str) -> None:
    existing = _find_pending_view_permission(db, tenant_id, view_id, user_id) or db.scalar(
        select(ViewPermissionModel).where(
            ViewPermissionModel.tenant_id == tenant_id,
            ViewPermissionModel.view_id == view_id,
            ViewPermissionModel.user_id == user_id,
        )
    )
    if existing:
        existing.can_read = True
        existing.can_write = True
        return
    db.add(
        ViewPermissionModel(
            tenant_id=tenant_id,
            view_id=view_id,
            user_id=user_id,
            can_read=True,
            can_write=True,
            created_at=now_utc_naive(),
        )
    )


def _ensure_direct_table_permission(db: Session, tenant_id: str, table_id: str, user_id: str) -> None:
    existing = _find_pending_table_permission(db, tenant_id, table_id, user_id) or db.scalar(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
            TablePermissionModel.user_id == user_id,
        )
    )
    if existing:
        existing.can_read = True
        existing.can_write = True
        existing.can_create_record = True
        existing.can_delete_record = True
        existing.can_import_records = True
        existing.can_export_records = True
        existing.can_manage_filters = True
        existing.can_manage_sorts = True
        return
    db.add(
        TablePermissionModel(
            tenant_id=tenant_id,
            table_id=table_id,
            user_id=user_id,
            can_read=True,
            can_write=True,
            can_create_record=True,
            can_delete_record=True,
            can_import_records=True,
            can_export_records=True,
            can_manage_filters=True,
            can_manage_sorts=True,
            created_at=now_utc_naive(),
        )
    )


def _grant_default_table_permissions(db: Session, tenant_id: str, table_id: str, creator_user_id: str) -> None:
    memberships = db.scalars(
        select(MembershipModel).where(MembershipModel.tenant_id == tenant_id)
    ).all()
    role_map = {
        item.key: item
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant_id)).all()
    }
    for membership in memberships:
        can_read = membership.role == "owner"
        can_write = membership.role == "owner"
        if membership.role != "owner":
            role = role_map.get(membership.role_key)
            if role:
                can_read = bool(role.default_table_can_read or role.default_table_can_write)
                can_write = bool(role.default_table_can_write)
        existing = db.scalar(
            select(TablePermissionModel).where(
                TablePermissionModel.tenant_id == tenant_id,
                TablePermissionModel.table_id == table_id,
                TablePermissionModel.user_id == membership.user_id,
            )
        )
        if existing:
            existing.can_read = can_read
            existing.can_write = can_write
            continue
        db.add(
            TablePermissionModel(
                tenant_id=tenant_id,
                table_id=table_id,
                user_id=membership.user_id,
                can_read=can_read,
                can_write=can_write,
                created_at=now_utc_naive(),
            )
        )
    _ensure_direct_table_permission(db, tenant_id, table_id, creator_user_id)


def _get_or_create_default_view_folder(db: Session, tenant: TenantModel, table: TableModel) -> ViewFolderModel:
    folder = db.scalar(
        select(ViewFolderModel)
        .where(ViewFolderModel.tenant_id == tenant.id, ViewFolderModel.table_id == table.id)
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    )
    if folder:
        return folder
    folder = ViewFolderModel(
        id=_next_id("vfd"),
        tenant_id=tenant.id,
        table_id=table.id,
        name=table.name,
        sort_order=0,
        is_enabled=True,
        created_at=now_utc_naive(),
    )
    db.add(folder)
    db.flush()
    return folder


def _to_view_folder_out(folder: ViewFolderModel) -> ViewFolderOut:
    return ViewFolderOut(
        id=folder.id,
        tableId=folder.table_id,
        name=folder.name,
        sortOrder=int(folder.sort_order or 0),
        isEnabled=bool(folder.is_enabled),
    )


def _normalize_view_folder_orders(folders: list[ViewFolderModel]) -> None:
    for index, folder in enumerate(sorted(folders, key=lambda item: (item.sort_order, item.id))):
        folder.sort_order = index


def _sync_derived_folder_ids(db: Session, tenant_id: str, primary_view: ViewModel) -> None:
    if primary_view.type != "grid" or (primary_view.view_role or "primary") != "primary":
        return
    derived_views = db.scalars(
        select(ViewModel).where(
            ViewModel.tenant_id == tenant_id,
            ViewModel.source_view_id == primary_view.id,
        )
    ).all()
    for derived_view in derived_views:
        derived_view.folder_id = primary_view.folder_id


def _resolve_folder_for_table(
    db: Session,
    tenant_id: str,
    table_id: str,
    folder_id: str,
) -> ViewFolderModel:
    folder = db.scalar(
        select(ViewFolderModel).where(
            ViewFolderModel.id == folder_id,
            ViewFolderModel.tenant_id == tenant_id,
            ViewFolderModel.table_id == table_id,
        )
    )
    if not folder:
        raise HTTPException(status_code=400, detail="视图菜单不存在或不属于当前数据表")
    return folder


def _ensure_primary_grid_for_table(
    db: Session,
    tenant: TenantModel,
    table: TableModel,
) -> ViewModel:
    primary_views = _sort_views_for_catalog(
        db.scalars(
            select(ViewModel).where(
                ViewModel.tenant_id == tenant.id,
                ViewModel.table_id == table.id,
                ViewModel.type == "grid",
            )
        ).all()
    )
    if primary_views:
        primary = primary_views[0]
        if primary.source_view_id is not None:
            primary.source_view_id = None
        if primary.view_role != "primary":
            primary.view_role = "primary"
        if not primary.folder_id:
            primary.folder_id = _get_or_create_default_view_folder(db, tenant, table).id
        db.flush()
        return primary

    default_folder = _get_or_create_default_view_folder(db, tenant, table)
    existing_views = db.scalars(
        select(ViewModel).where(ViewModel.table_id == table.id, ViewModel.tenant_id == tenant.id)
    ).all()
    next_order = max((int((view.config_json or {}).get("order", 0)) for view in existing_views), default=-1) + 1
    created = ViewModel(
        id=_next_id("viw"),
        tenant_id=tenant.id,
        table_id=table.id,
        folder_id=default_folder.id,
        source_view_id=None,
        view_role="primary",
        name="表格",
        type="grid",
        config_json={**dict(DEFAULT_VIEW_CONFIG), "order": next_order, "isEnabled": True},
    )
    db.add(created)
    db.flush()
    _mirror_table_permissions_to_view(db, tenant.id, table.id, created.id)
    return created


def _resolve_view_hierarchy_for_create(
    db: Session,
    tenant: TenantModel,
    table: TableModel,
    payload: ViewCreateIn,
) -> tuple[str | None, str | None, str]:
    default_folder = _get_or_create_default_view_folder(db, tenant, table)
    target_type = payload.type

    if target_type == "grid":
        if payload.viewRole == "derived":
            raise HTTPException(status_code=400, detail="表格视图不能作为派生视图")
        folder = _resolve_folder_for_table(db, tenant.id, table.id, payload.folderId) if payload.folderId else default_folder
        return folder.id, None, "primary"

    if payload.viewRole == "primary":
        raise HTTPException(status_code=400, detail="只有表格视图可以作为主视图")

    source_view: ViewModel | None = None
    if payload.sourceViewId:
        source_view = db.scalar(
            select(ViewModel).where(
                ViewModel.id == payload.sourceViewId,
                ViewModel.tenant_id == tenant.id,
                ViewModel.table_id == table.id,
            )
        )
        if not source_view:
            raise HTTPException(status_code=400, detail="绑定的主视图不存在")
    if source_view is None:
        source_view = _ensure_primary_grid_for_table(db, tenant, table)
    if source_view.type != "grid" or (source_view.view_role or "primary") != "primary":
        raise HTTPException(status_code=400, detail="派生视图必须绑定到表格主视图")
    if payload.folderId:
        # Derived views inherit the source folder for consistency.
        _resolve_folder_for_table(db, tenant.id, table.id, payload.folderId)
    return source_view.folder_id or default_folder.id, source_view.id, "derived"


def _build_view_catalog(
    folders: list[ViewFolderModel],
    views: list[ViewModel],
) -> ViewCatalogOut:
    visible_views = _sort_views_for_catalog(views)
    derived_by_source: dict[str, list[ViewModel]] = {}
    primary_by_folder: dict[str, list[ViewModel]] = {}

    for view in visible_views:
        role = view.view_role or ("primary" if view.type == "grid" else "derived")
        if role == "primary" and view.type == "grid":
            primary_by_folder.setdefault(view.folder_id or "", []).append(view)
            continue
        if view.source_view_id:
            derived_by_source.setdefault(view.source_view_id, []).append(view)

    folder_items: list[ViewFolderCatalogOut] = []
    for folder in sorted(folders, key=lambda item: (item.sort_order, item.id)):
        primary_views = primary_by_folder.get(folder.id, [])
        primary_items = [
            ViewCatalogItemOut(
                view=to_view_out(primary),
                derivedViews=[to_view_out(item) for item in _sort_views_for_catalog(derived_by_source.get(primary.id, []))],
            )
            for primary in primary_views
        ]
        folder_items.append(
            ViewFolderCatalogOut(
                id=folder.id,
                tableId=folder.table_id,
                name=folder.name,
                sortOrder=int(folder.sort_order or 0),
                isEnabled=bool(folder.is_enabled),
                primaryViews=primary_items,
            )
        )

    table_id = folders[0].table_id if folders else (visible_views[0].table_id if visible_views else "")
    return ViewCatalogOut(tableId=table_id, folders=folder_items)


def _to_table_catalog_out(table: TableModel, default_view_id: str | None = None) -> TableCatalogOut:
    return TableCatalogOut(
        id=table.id,
        baseId=table.base_id,
        name=table.name,
        defaultViewId=default_view_id,
        sortOrder=int(table.sort_order or 0),
    )


@router.get("/bases/{base_id}/tables", response_model=list[TableCatalogOut])
def list_tables_for_base(
    base_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[TableCatalogOut]:
    base = db.scalar(select(BaseModel).where(BaseModel.id == base_id, BaseModel.tenant_id == tenant.id))
    if not base:
        exists_any = db.scalar(select(BaseModel).where(BaseModel.id == base_id))
        if exists_any:
            _audit_cross_tenant_access(
                db,
                request=request,
                user_id=user.id,
                tenant_id=tenant.id,
                resource_type="base",
                resource_id=base_id,
            )
        raise HTTPException(status_code=404, detail="数据集不存在")

    role = _get_membership_role(db, user.id, tenant.id)
    if role == "owner":
        tables = db.scalars(
            select(TableModel)
            .where(TableModel.base_id == base_id, TableModel.tenant_id == tenant.id)
            .order_by(TableModel.sort_order.asc(), TableModel.id.asc())
        ).all()
    else:
        tables = db.scalars(
            select(TableModel)
            .join(TablePermissionModel, TablePermissionModel.table_id == TableModel.id)
            .where(
                TableModel.base_id == base_id,
                TableModel.tenant_id == tenant.id,
                TablePermissionModel.tenant_id == tenant.id,
                TablePermissionModel.user_id == user.id,
                or_(TablePermissionModel.can_read.is_(True), TablePermissionModel.can_write.is_(True)),
            )
            .order_by(TableModel.sort_order.asc(), TableModel.id.asc())
        ).all()

    table_ids = [item.id for item in tables]
    if not table_ids:
        return []

    views = db.scalars(
        select(ViewModel).where(ViewModel.table_id.in_(table_ids), ViewModel.tenant_id == tenant.id)
    ).all()
    visible_views = _filter_views_for_user(db, tenant.id, user.id, views)
    visible_views_by_table: dict[str, list[ViewModel]] = {}
    for view in visible_views:
        visible_views_by_table.setdefault(view.table_id, []).append(view)
    for items in visible_views_by_table.values():
        items[:] = _sort_views_for_catalog(items)

    result: list[TableCatalogOut] = []
    for table in tables:
        table_views = visible_views_by_table.get(table.id, [])
        default_view = next((item for item in table_views if (item.view_role or "primary") == "primary"), None)
        if default_view is None:
            default_view = next(iter(table_views), None)
        result.append(_to_table_catalog_out(table, default_view.id if default_view else None))
    return result


@router.post("/bases/{base_id}/tables", response_model=TableCatalogOut)
def create_table_for_base(
    base_id: str,
    payload: TableCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> TableCatalogOut:
    base = db.scalar(select(BaseModel).where(BaseModel.id == base_id, BaseModel.tenant_id == tenant.id))
    if not base:
        exists_any = db.scalar(select(BaseModel).where(BaseModel.id == base_id))
        if exists_any:
            _audit_cross_tenant_access(
                db,
                request=request,
                user_id=user.id,
                tenant_id=tenant.id,
                resource_type="base",
                resource_id=base_id,
            )
        raise HTTPException(status_code=404, detail="数据集不存在")

    _ensure_manage_table_permissions_allowed(db, user.id, tenant.id)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="数据表名称不能为空")

    existing = db.scalar(
        select(TableModel).where(
            TableModel.base_id == base_id,
            TableModel.tenant_id == tenant.id,
            TableModel.name == name,
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="同一数据集下已存在同名数据表")

    created_table = TableModel(
        id=_next_id("tbl"),
        tenant_id=tenant.id,
        base_id=base_id,
        name=name,
        sort_order=db.scalar(
            select(func.count()).select_from(TableModel).where(
                TableModel.base_id == base_id,
                TableModel.tenant_id == tenant.id,
            )
        )
        or 0,
    )
    db.add(created_table)
    db.flush()

    primary_field = FieldModel(
        id=_next_id("fld"),
        tenant_id=tenant.id,
        table_id=created_table.id,
        name="名称",
        type="text",
        width=260,
        options_json=None,
        sort_order=0,
    )
    db.add(primary_field)
    db.flush()

    _grant_default_table_permissions(db, tenant.id, created_table.id, user.id)

    default_folder = _get_or_create_default_view_folder(db, tenant, created_table)
    primary_view = ViewModel(
        id=_next_id("viw"),
        tenant_id=tenant.id,
        table_id=created_table.id,
        folder_id=default_folder.id,
        source_view_id=None,
        view_role="primary",
        name="表格",
        type="grid",
        config_json={
            **dict(DEFAULT_VIEW_CONFIG),
            "hiddenFieldIds": [],
            "fieldOrderIds": [primary_field.id],
            "columnWidths": {primary_field.id: int(primary_field.width or 260)},
            "order": 0,
            "isEnabled": True,
        },
    )
    db.add(primary_view)
    db.flush()

    _mirror_table_permissions_to_view(db, tenant.id, created_table.id, primary_view.id)
    _ensure_direct_view_permission(db, tenant.id, primary_view.id, user.id)

    write_audit_log(
        db,
        action="table_create",
        result="success",
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=created_table.id,
        detail=f"base_id={base_id}",
    )

    db.commit()
    return _to_table_catalog_out(created_table, primary_view.id)


@router.patch("/tables/{table_id}", response_model=TableCatalogOut)
def patch_table(
    table_id: str,
    payload: TablePatchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> TableCatalogOut:
    table = db.scalar(select(TableModel).where(TableModel.id == table_id, TableModel.tenant_id == tenant.id))
    if not table:
        raise HTTPException(status_code=404, detail="数据表不存在")

    _ensure_manage_table_permissions_allowed(db, user.id, tenant.id)

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="数据表名称不能为空")
        existing = db.scalar(
            select(TableModel).where(
                TableModel.base_id == table.base_id,
                TableModel.tenant_id == tenant.id,
                TableModel.name == name,
                TableModel.id != table.id,
            )
        )
        if existing:
            raise HTTPException(status_code=400, detail="同一数据集下已存在同名数据表")
        table.name = name

    write_audit_log(
        db,
        action="table_patch",
        result="success",
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table.id,
    )
    db.commit()

    visible_views = _filter_views_for_user(
        db,
        tenant.id,
        user.id,
        db.scalars(select(ViewModel).where(ViewModel.table_id == table.id, ViewModel.tenant_id == tenant.id)).all(),
    )
    visible_views = _sort_views_for_catalog(visible_views)
    default_view = next((item for item in visible_views if (item.view_role or "primary") == "primary"), None)
    if default_view is None:
        default_view = next(iter(visible_views), None)
    return _to_table_catalog_out(table, default_view.id if default_view else None)


@router.put("/bases/{base_id}/tables/reorder", response_model=list[TableCatalogOut])
def reorder_tables_for_base(
    base_id: str,
    payload: TableReorderIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[TableCatalogOut]:
    base = db.scalar(select(BaseModel).where(BaseModel.id == base_id, BaseModel.tenant_id == tenant.id))
    if not base:
        exists_any = db.scalar(select(BaseModel).where(BaseModel.id == base_id))
        if exists_any:
            _audit_cross_tenant_access(
                db,
                request=request,
                user_id=user.id,
                tenant_id=tenant.id,
                resource_type="base",
                resource_id=base_id,
            )
        raise HTTPException(status_code=404, detail="数据集不存在")

    _ensure_manage_table_permissions_allowed(db, user.id, tenant.id)

    tables = db.scalars(
        select(TableModel)
        .where(TableModel.base_id == base_id, TableModel.tenant_id == tenant.id)
        .order_by(TableModel.sort_order.asc(), TableModel.id.asc())
    ).all()
    if not tables:
        return []

    lookup = {table.id: table for table in tables}
    ordered_ids = [table_id for table_id in payload.orderedIds if table_id in lookup]
    missing_ids = [table.id for table in tables if table.id not in ordered_ids]
    next_ids = ordered_ids + missing_ids
    for index, next_table_id in enumerate(next_ids):
        lookup[next_table_id].sort_order = index

    db.commit()

    tables = db.scalars(
        select(TableModel)
        .where(TableModel.base_id == base_id, TableModel.tenant_id == tenant.id)
        .order_by(TableModel.sort_order.asc(), TableModel.id.asc())
    ).all()
    views = db.scalars(
        select(ViewModel).where(ViewModel.table_id.in_([table.id for table in tables]), ViewModel.tenant_id == tenant.id)
    ).all()
    visible_views = _filter_views_for_user(db, tenant.id, user.id, views)
    visible_views_by_table: dict[str, list[ViewModel]] = {}
    for view in visible_views:
        visible_views_by_table.setdefault(view.table_id, []).append(view)
    for items in visible_views_by_table.values():
        items[:] = _sort_views_for_catalog(items)
    result: list[TableCatalogOut] = []
    for table in tables:
        table_views = visible_views_by_table.get(table.id, [])
        default_view = next((item for item in table_views if (item.view_role or "primary") == "primary"), None)
        if default_view is None:
            default_view = next(iter(table_views), None)
        result.append(_to_table_catalog_out(table, default_view.id if default_view else None))
    return result


@router.delete("/tables/{table_id}", status_code=204, response_class=Response)
def delete_table(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> Response:
    table = db.scalar(select(TableModel).where(TableModel.id == table_id, TableModel.tenant_id == tenant.id))
    if not table:
        raise HTTPException(status_code=404, detail="数据表不存在")

    _ensure_manage_table_permissions_allowed(db, user.id, tenant.id)

    write_audit_log(
        db,
        action="table_delete",
        result="success",
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table.id,
    )
    sibling_tables = db.scalars(
        select(TableModel)
        .where(
            TableModel.base_id == table.base_id,
            TableModel.tenant_id == tenant.id,
            TableModel.id != table.id,
        )
        .order_by(TableModel.sort_order.asc(), TableModel.id.asc())
    ).all()
    db.delete(table)
    for index, sibling in enumerate(sibling_tables):
        sibling.sort_order = index
    db.commit()
    return Response(status_code=204)


@router.get("/tables/{table_id}/reference-members", response_model=list[ReferenceMemberOut])
def get_table_reference_members(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[ReferenceMemberOut]:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    user_ids = sorted(_get_table_reference_member_ids(db, tenant.id, table_id))
    if not user_ids:
        return []
    users = db.scalars(select(UserModel).where(UserModel.id.in_(user_ids))).all()
    return [ReferenceMemberOut(userId=item.id, username=item.username) for item in users]


@router.get("/tables/{table_id}/fields", response_model=list[FieldOut])
def get_fields(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[FieldOut]:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    fields = db.scalars(
        select(FieldModel)
        .where(FieldModel.table_id == table_id, FieldModel.tenant_id == tenant.id)
        .order_by(FieldModel.sort_order.asc())
    ).all()
    return [to_field_out(field) for field in fields]


@router.post("/tables/{table_id}/fields", response_model=FieldOut)
def create_field(
    table_id: str,
    payload: FieldCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> FieldOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    if payload.type in {"singleSelect", "multiSelect"} and not payload.options:
        raise HTTPException(status_code=400, detail="单选/多选字段必须提供预设选项")
    field_count = db.scalar(
        select(func.count()).select_from(FieldModel).where(FieldModel.table_id == table_id, FieldModel.tenant_id == tenant.id)
    ) or 0
    created = FieldModel(
        id=_next_id("fld_dynamic"),
        tenant_id=tenant.id,
        table_id=table_id,
        name=payload.name,
        type=payload.type,
        width=payload.width,
        options_json=[item.model_dump() for item in payload.options] if payload.options else None,
        sort_order=int(field_count),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return to_field_out(created)


@router.get("/tables/{table_id}/views", response_model=list[ViewOut])
def get_views(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[ViewOut]:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    views = db.scalars(
        select(ViewModel).where(ViewModel.table_id == table_id, ViewModel.tenant_id == tenant.id)
    ).all()
    views = _filter_views_for_user(db, tenant.id, user.id, views)
    views = _sort_views_for_catalog(views)
    return [to_view_out(view) for view in views]


@router.get("/tables/{table_id}/view-catalog", response_model=ViewCatalogOut)
def get_view_catalog(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewCatalogOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    folders = db.scalars(
        select(ViewFolderModel)
        .where(ViewFolderModel.table_id == table_id, ViewFolderModel.tenant_id == tenant.id)
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    ).all()
    views = db.scalars(
        select(ViewModel).where(ViewModel.table_id == table_id, ViewModel.tenant_id == tenant.id)
    ).all()
    visible_views = _filter_views_for_user(db, tenant.id, user.id, views)
    return _build_view_catalog(folders, visible_views)


@router.post("/tables/{table_id}/view-folders", response_model=ViewFolderOut)
def create_view_folder(
    table_id: str,
    payload: ViewFolderCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewFolderOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    table = db.scalar(select(TableModel).where(TableModel.id == table_id, TableModel.tenant_id == tenant.id))
    if not table:
        raise HTTPException(status_code=404, detail="数据表不存在")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="菜单名称不能为空")
    current_folders = db.scalars(
        select(ViewFolderModel)
        .where(ViewFolderModel.table_id == table_id, ViewFolderModel.tenant_id == tenant.id)
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    ).all()
    created = ViewFolderModel(
        id=_next_id("vfd"),
        tenant_id=tenant.id,
        table_id=table_id,
        name=name,
        sort_order=len(current_folders),
        is_enabled=True,
        created_at=now_utc_naive(),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return _to_view_folder_out(created)


@router.patch("/view-folders/{folder_id}", response_model=ViewFolderOut)
def patch_view_folder(
    folder_id: str,
    payload: ViewFolderPatchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewFolderOut:
    folder = db.scalar(
        select(ViewFolderModel).where(
            ViewFolderModel.id == folder_id,
            ViewFolderModel.tenant_id == tenant.id,
        )
    )
    if not folder:
        raise HTTPException(status_code=404, detail="视图菜单不存在")
    _ensure_table_access(
        db,
        table_id=folder.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="菜单名称不能为空")
        folder.name = name
    if payload.isEnabled is not None:
        folder.is_enabled = bool(payload.isEnabled)
    db.commit()
    db.refresh(folder)
    return _to_view_folder_out(folder)


@router.put("/tables/{table_id}/view-folders/reorder", response_model=list[ViewFolderOut])
def reorder_view_folders(
    table_id: str,
    payload: ViewFolderReorderIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[ViewFolderOut]:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    folders = db.scalars(
        select(ViewFolderModel)
        .where(ViewFolderModel.table_id == table_id, ViewFolderModel.tenant_id == tenant.id)
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    ).all()
    if not folders:
        return []
    order_lookup = {folder.id: folder for folder in folders}
    ordered_ids = [folder_id for folder_id in payload.orderedIds if folder_id in order_lookup]
    missing_ids = [folder.id for folder in folders if folder.id not in ordered_ids]
    next_ids = ordered_ids + missing_ids
    for index, next_folder_id in enumerate(next_ids):
        order_lookup[next_folder_id].sort_order = index
    db.commit()
    ordered_folders = db.scalars(
        select(ViewFolderModel)
        .where(ViewFolderModel.table_id == table_id, ViewFolderModel.tenant_id == tenant.id)
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    ).all()
    return [_to_view_folder_out(folder) for folder in ordered_folders]


@router.delete("/view-folders/{folder_id}", status_code=204, response_class=Response)
def delete_view_folder(
    folder_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> Response:
    folder = db.scalar(
        select(ViewFolderModel).where(
            ViewFolderModel.id == folder_id,
            ViewFolderModel.tenant_id == tenant.id,
        )
    )
    if not folder:
        raise HTTPException(status_code=404, detail="视图菜单不存在")
    _ensure_table_access(
        db,
        table_id=folder.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    sibling_folders = db.scalars(
        select(ViewFolderModel)
        .where(
            ViewFolderModel.table_id == folder.table_id,
            ViewFolderModel.tenant_id == tenant.id,
        )
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    ).all()
    primary_views = db.scalars(
        select(ViewModel).where(
            ViewModel.table_id == folder.table_id,
            ViewModel.tenant_id == tenant.id,
            ViewModel.folder_id == folder.id,
            ViewModel.view_role == "primary",
        )
    ).all()
    fallback_folder = next((item for item in sibling_folders if item.id != folder.id), None)
    if primary_views and not fallback_folder:
        raise HTTPException(status_code=400, detail="当前菜单下仍有主视图，请先创建其他菜单后再删除")
    if fallback_folder:
        for primary_view in primary_views:
            primary_view.folder_id = fallback_folder.id
            _sync_derived_folder_ids(db, tenant.id, primary_view)
        orphan_derived_views = db.scalars(
            select(ViewModel).where(
                ViewModel.table_id == folder.table_id,
                ViewModel.tenant_id == tenant.id,
                ViewModel.folder_id == folder.id,
                ViewModel.view_role == "derived",
            )
        ).all()
        for derived_view in orphan_derived_views:
            derived_view.folder_id = fallback_folder.id
    db.delete(folder)
    _normalize_view_folder_orders([item for item in sibling_folders if item.id != folder.id])
    db.commit()
    return Response(status_code=204)


@router.post("/tables/{table_id}/views", response_model=ViewOut)
def create_view(
    table_id: str,
    payload: ViewCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    table = db.scalar(select(TableModel).where(TableModel.id == table_id, TableModel.tenant_id == tenant.id))
    if not table:
        raise HTTPException(status_code=404, detail="数据表不存在")
    existing_views = db.scalars(
        select(ViewModel).where(ViewModel.table_id == table_id, ViewModel.tenant_id == tenant.id)
    ).all()
    next_order = max((int((view.config_json or {}).get("order", 0)) for view in existing_views), default=-1) + 1
    config_json = payload.config.model_dump() if payload.config else dict(DEFAULT_VIEW_CONFIG)
    if "order" not in config_json:
        config_json["order"] = next_order
    if "isEnabled" not in config_json:
        config_json["isEnabled"] = True
    folder_id, source_view_id, view_role = _resolve_view_hierarchy_for_create(db, tenant, table, payload)
    if payload.config is None and payload.type == "grid" and view_role == "primary":
        # Additional primary grid views should start with no visible fields so the
        # user explicitly configures the column set instead of inheriting the table.
        config_json["hiddenFieldIds"] = [
            field.id
            for field in db.scalars(
                select(FieldModel)
                .where(FieldModel.table_id == table_id, FieldModel.tenant_id == tenant.id)
                .order_by(FieldModel.sort_order.asc(), FieldModel.id.asc())
            ).all()
        ]

    created = ViewModel(
        id=_next_id("viw"),
        tenant_id=tenant.id,
        table_id=table_id,
        folder_id=folder_id,
        source_view_id=source_view_id,
        view_role=view_role,
        name=payload.name,
        type=payload.type,
        config_json=config_json,
    )
    db.add(created)
    db.flush()
    _mirror_table_permissions_to_view(db, tenant.id, table_id, created.id)
    db.flush()
    _ensure_direct_view_permission(db, tenant.id, created.id, user.id)
    db.commit()
    db.refresh(created)
    return to_view_out(created)


@router.post("/tables/{table_id}/views/import", response_model=ImportViewBundleOut)
def import_view_bundle(
    table_id: str,
    payload: ImportViewBundleIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ImportViewBundleOut:
    return _import_view_bundle_for_table(table_id, payload, request, db, user, tenant)


@router.post("/views/import", response_model=ImportViewBundleOut, deprecated=True)
def import_view_bundle_legacy(
    payload: ImportViewBundleLegacyIn,
    request: Request,
    table_id: str | None = Query(default=None, alias="tableId"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ImportViewBundleOut:
    resolved_table_id = (table_id or payload.tableId or "").strip()
    if not resolved_table_id:
        raise HTTPException(status_code=400, detail="缺少 tableId")
    normalized_payload = ImportViewBundleIn(
        viewName=payload.viewName,
        viewType=payload.viewType,
        folderId=payload.folderId,
        fields=payload.fields,
        records=payload.records,
    )
    return _import_view_bundle_for_table(resolved_table_id, normalized_payload, request, db, user, tenant)


def _import_view_bundle_for_table(
    table_id: str,
    payload: ImportViewBundleIn,
    request: Request,
    db: Session,
    user: UserModel,
    tenant: TenantModel,
) -> ImportViewBundleOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_table_button_permission(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        button_key="can_import_records",
    )
    table = db.scalar(select(TableModel).where(TableModel.id == table_id, TableModel.tenant_id == tenant.id))
    if not table:
        raise HTTPException(status_code=404, detail="数据表不存在")
    view_name = payload.viewName.strip()
    if not view_name:
        raise HTTPException(status_code=400, detail="视图名称不能为空")
    if not payload.fields:
        raise HTTPException(status_code=400, detail="导入视图至少需要 1 个字段")
    field_names = [item.name.strip() for item in payload.fields]
    if any(not item for item in field_names):
        raise HTTPException(status_code=400, detail="字段名称不能为空")
    if len(set(field_names)) != len(field_names):
        raise HTTPException(status_code=400, detail="字段名称不能重复")

    existing_views = db.scalars(
        select(ViewModel).where(ViewModel.table_id == table_id, ViewModel.tenant_id == tenant.id)
    ).all()
    next_order = max((int((view.config_json or {}).get("order", 0)) for view in existing_views), default=-1) + 1
    create_payload = ViewCreateIn(
        name=view_name,
        type=payload.viewType,
        folderId=payload.folderId,
        config=ViewConfig.model_validate({**dict(DEFAULT_VIEW_CONFIG), "order": next_order}),
    )
    folder_id, source_view_id, view_role = _resolve_view_hierarchy_for_create(db, tenant, table, create_payload)
    created_view = ViewModel(
        id=_next_id("viw"),
        tenant_id=tenant.id,
        table_id=table_id,
        folder_id=folder_id,
        source_view_id=source_view_id,
        view_role=view_role,
        name=view_name,
        type=payload.viewType,
        config_json={**dict(DEFAULT_VIEW_CONFIG), "order": next_order},
    )
    db.add(created_view)
    db.flush()
    _mirror_table_permissions_to_view(db, tenant.id, table_id, created_view.id)
    db.flush()
    _ensure_direct_view_permission(db, tenant.id, created_view.id, user.id)

    created_fields: list[FieldModel] = []
    field_map_by_name: dict[str, FieldModel] = {}
    for index, field in enumerate(payload.fields):
        name = field.name.strip()
        if field.type in {"singleSelect", "multiSelect"} and not field.options:
            raise HTTPException(status_code=400, detail=f"字段 {name} 为单选/多选时必须提供预设选项")
        created_field = FieldModel(
            id=_next_id("fld_dynamic"),
            tenant_id=tenant.id,
            table_id=table_id,
            name=name,
            type=field.type,
            width=field.width,
            options_json=[item.model_dump() for item in field.options] if field.options else None,
            sort_order=index,
        )
        db.add(created_field)
        created_fields.append(created_field)
        field_map_by_name[name] = created_field

    db.flush()
    fields_by_id = {item.id: item for item in created_fields}
    allowed_member_ids = _get_table_reference_member_ids(db, tenant.id, table_id)
    for row in payload.records:
        record = RecordModel(
            id=_next_id("rec"),
            tenant_id=tenant.id,
            table_id=table_id,
            created_at=now_utc_naive(),
            updated_at=now_utc_naive(),
        )
        db.add(record)
        initial_values = {
            field_map_by_name[field.name.strip()].id: row.get(field.name.strip())
            for field in payload.fields
            if field.name.strip() in field_map_by_name
        }
        upsert_record_values(db, record, fields_by_id, initial_values, allowed_member_ids)

    db.commit()
    return ImportViewBundleOut(
        viewId=created_view.id,
        viewName=created_view.name,
        fieldIds=[item.id for item in created_fields],
        recordCount=len(payload.records),
    )


@router.patch("/views/{view_id}", response_model=ViewOut)
def patch_view(
    view_id: str,
    payload: ViewPatchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewOut:
    view = _ensure_view_access(
        db,
        view_id=view_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_table_access(
        db,
        table_id=view.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    if payload.name is not None:
        view.name = payload.name
    if payload.type is not None:
        if payload.type != "grid" and (payload.viewRole or view.view_role or "primary") == "primary":
            raise HTTPException(status_code=400, detail="只有表格视图可以作为主视图")
        view.type = payload.type
    if payload.viewRole is not None:
        next_type = payload.type or view.type
        if payload.viewRole == "primary":
            if next_type != "grid":
                raise HTTPException(status_code=400, detail="只有表格视图可以作为主视图")
            view.view_role = "primary"
            view.source_view_id = None
        else:
            if next_type == "grid":
                raise HTTPException(status_code=400, detail="表格视图不能作为派生视图")
            view.view_role = "derived"
    if payload.folderId is not None:
        if (view.view_role or "primary") != "primary":
            raise HTTPException(status_code=400, detail="派生视图的菜单由主视图继承")
        folder = _resolve_folder_for_table(db, tenant.id, view.table_id, payload.folderId)
        view.folder_id = folder.id
        _sync_derived_folder_ids(db, tenant.id, view)
    if payload.sourceViewId is not None:
        source_view = db.scalar(
            select(ViewModel).where(
                ViewModel.id == payload.sourceViewId,
                ViewModel.tenant_id == tenant.id,
                ViewModel.table_id == view.table_id,
            )
        )
        if not source_view:
            raise HTTPException(status_code=400, detail="绑定的主视图不存在")
        if source_view.type != "grid" or (source_view.view_role or "primary") != "primary":
            raise HTTPException(status_code=400, detail="派生视图必须绑定到表格主视图")
        view.source_view_id = source_view.id
        view.view_role = "derived"
        view.folder_id = source_view.folder_id
    final_role = view.view_role or "primary"
    if final_role == "primary" and view.type != "grid":
        raise HTTPException(status_code=400, detail="只有表格视图可以作为主视图")
    if final_role == "derived":
        if view.type == "grid":
            raise HTTPException(status_code=400, detail="表格视图不能作为派生视图")
        if not view.source_view_id:
            raise HTTPException(status_code=400, detail="派生视图必须绑定主视图")
    if payload.config is not None:
        view.config_json = payload.config.model_dump()
    db.commit()
    db.refresh(view)
    return to_view_out(view)


@router.delete("/views/{view_id}", status_code=204, response_class=Response)
def delete_view(
    view_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> Response:
    view = _ensure_view_access(
        db,
        view_id=view_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_table_access(
        db,
        table_id=view.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    derived_views = (
        db.scalars(
            select(ViewModel).where(
                ViewModel.table_id == view.table_id,
                ViewModel.tenant_id == tenant.id,
                ViewModel.source_view_id == view.id,
            )
        ).all()
        if view.type == "grid" and (view.view_role or "primary") == "primary"
        else []
    )
    total_view_count = db.scalar(
        select(func.count()).select_from(ViewModel).where(ViewModel.table_id == view.table_id, ViewModel.tenant_id == tenant.id)
    ) or 0
    if int(total_view_count) - (1 + len(derived_views)) <= 0:
        raise HTTPException(status_code=400, detail="至少保留一个视图，不能删除最后一个视图")
    for derived_view in derived_views:
        db.delete(derived_view)
    db.delete(view)
    db.commit()
    return Response(status_code=204)


@router.get("/tables/{table_id}/records", response_model=RecordPageOut)
def get_records(
    table_id: str,
    request: Request,
    viewId: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    pageSize: int = Query(default=100, ge=1, le=500),
    filters: str | None = Query(default=None),
    sorts: str | None = Query(default=None),
    filterLogic: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> RecordPageOut:
    query_filters = _parse_json_list(filters, "filters")
    query_sorts = _parse_json_list(sorts, "sorts")
    return _query_records(
        db=db,
        table_id=table_id,
        view_id=viewId,
        cursor=cursor,
        page_size=pageSize,
        query_filters=query_filters,
        query_sorts=query_sorts,
        query_filter_logic=filterLogic,
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
    )


@router.post("/tables/{table_id}/records/query", response_model=RecordPageOut)
def query_records(
    table_id: str,
    payload: RecordQueryIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> RecordPageOut:
    return _query_records(
        db=db,
        table_id=table_id,
        view_id=payload.viewId,
        cursor=payload.cursor,
        page_size=payload.pageSize,
        query_filters=payload.filters,
        query_sorts=payload.sorts,
        query_filter_logic=payload.filterLogic,
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
    )


def _query_records(
    db: Session,
    table_id: str,
    view_id: str | None,
    cursor: str | None,
    page_size: int,
    query_filters: list[dict[str, Any]] | None,
    query_sorts: list[dict[str, Any]] | None,
    query_filter_logic: str | None,
    request: Request,
    user_id: str,
    tenant_id: str,
) -> RecordPageOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant_id,
        user_id=user_id,
        request=request,
        access="read",
    )
    if not view_id and _get_membership_role(db, user_id, tenant_id) != "owner":
        raise HTTPException(status_code=400, detail="非 Owner 查询记录必须指定 viewId")
    view: ViewModel | None = None
    if view_id:
        view = _ensure_view_access(
            db,
            view_id=view_id,
            tenant_id=tenant_id,
            user_id=user_id,
            request=request,
            access="read",
            expected_table_id=table_id,
        )

    view_config = view.config_json if view else {}
    effective_filters = query_filters if query_filters is not None else list(view_config.get("filters", []))
    effective_sorts = query_sorts if query_sorts is not None else list(view_config.get("sorts", []))
    effective_filter_logic = (query_filter_logic or str(view_config.get("filterLogic", "and"))).lower()
    if effective_filter_logic not in {"and", "or"}:
        raise HTTPException(status_code=400, detail="filterLogic 仅支持 and / or")

    start = 0
    if cursor:
        try:
            start = int(cursor)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="cursor 非法") from exc
    if start < 0:
        raise HTTPException(status_code=400, detail="cursor 非法")

    record_where = (RecordModel.table_id == table_id, RecordModel.tenant_id == tenant_id)

    # Fast path: no filter/sort means we can page in SQL instead of loading the whole table into memory.
    if not effective_filters and not effective_sorts:
        total_count = db.scalar(select(func.count()).select_from(RecordModel).where(*record_where)) or 0
        page_stmt = (
            select(RecordModel)
            .where(*record_where)
            .options(joinedload(RecordModel.values))
            .order_by(RecordModel.created_at.desc(), RecordModel.id.desc())
            .offset(start)
            .limit(page_size)
        )
        sliced = db.scalars(page_stmt).unique().all()
        next_cursor: str | None = None
        if start + page_size < total_count:
            next_cursor = str(start + page_size)
        return RecordPageOut(
            items=[serialize_record(record) for record in sliced],
            nextCursor=next_cursor,
            totalCount=total_count,
        )

    fields = db.scalars(select(FieldModel).where(FieldModel.table_id == table_id, FieldModel.tenant_id == tenant_id)).all()
    fields_by_id = {field.id: field for field in fields}

    # Filter-only queries can page in SQL by matched record IDs and only hydrate the current page.
    if effective_filters and not effective_sorts:
        filter_clause = build_record_filter_clause(fields_by_id, effective_filters, effective_filter_logic)
        if filter_clause is not None:
            filtered_where = (*record_where, filter_clause)
            total_count = int(db.scalar(select(func.count()).select_from(RecordModel).where(*filtered_where)) or 0)
            page_ids = db.scalars(
                select(RecordModel.id)
                .where(*filtered_where)
                .order_by(RecordModel.created_at.desc(), RecordModel.id.desc())
                .offset(start)
                .limit(page_size)
            ).all()
            sliced: list[RecordModel] = []
            if page_ids:
                id_order = {record_id: index for index, record_id in enumerate(page_ids)}
                page_records = db.scalars(
                    select(RecordModel)
                    .where(RecordModel.id.in_(page_ids))
                    .options(joinedload(RecordModel.values))
                ).unique().all()
                sliced = sorted(page_records, key=lambda record: id_order.get(record.id, len(id_order)))
            next_cursor: str | None = None
            if start + page_size < total_count:
                next_cursor = str(start + page_size)
            return RecordPageOut(
                items=[serialize_record(record) for record in sliced],
                nextCursor=next_cursor,
                totalCount=total_count,
            )

    stmt = (
        select(RecordModel)
        .where(*record_where)
        .options(joinedload(RecordModel.values))
        .order_by(RecordModel.created_at.desc(), RecordModel.id.desc())
    )
    records = db.scalars(stmt).unique().all()
    records = apply_filters_and_sorts(records, fields_by_id, effective_filters, effective_sorts, effective_filter_logic)

    sliced = records[start : start + page_size]
    next_cursor: str | None = None
    if start + page_size < len(records):
        next_cursor = str(start + page_size)

    return RecordPageOut(
        items=[serialize_record(record) for record in sliced],
        nextCursor=next_cursor,
        totalCount=len(records),
    )


@router.patch("/records/{record_id}", response_model=RecordOut)
def patch_record(
    record_id: str,
    payload: RecordPatchIn | dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> RecordOut:
    record = _ensure_record_exists(db, record_id, tenant.id, request, user.id)
    _ensure_table_access(
        db,
        table_id=record.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    fields = db.scalars(select(FieldModel).where(FieldModel.table_id == record.table_id, FieldModel.tenant_id == tenant.id)).all()
    fields_by_id = {field.id: field for field in fields}
    allowed_member_ids = _get_table_reference_member_ids(db, tenant.id, record.table_id)
    expected_version: int | None = None
    if isinstance(payload, RecordPatchIn):
        patch = payload.valuesPatch
        expected_version = payload.expectedVersion
    else:
        patch = payload.get("valuesPatch", payload)
        if isinstance(payload.get("expectedVersion"), int):
            expected_version = int(payload.get("expectedVersion"))
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="PATCH 请求体格式错误")
    if expected_version is not None and int(record.version or 0) != expected_version:
        raise HTTPException(status_code=409, detail="记录版本冲突，请刷新后重试")
    upsert_record_values(db, record, fields_by_id, patch, allowed_member_ids)
    record.version = int(record.version or 0) + 1
    db.commit()
    db.refresh(record)
    return serialize_record(record)


@router.post("/tables/{table_id}/records", response_model=RecordOut)
def create_record(
    table_id: str,
    request: Request,
    payload: CreateRecordIn | dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> RecordOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_table_button_permission(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        button_key="can_create_record",
    )
    record = RecordModel(
        id=_next_id("rec"),
        tenant_id=tenant.id,
        table_id=table_id,
        created_at=now_utc_naive(),
        updated_at=now_utc_naive(),
    )
    db.add(record)
    fields = db.scalars(select(FieldModel).where(FieldModel.table_id == table_id, FieldModel.tenant_id == tenant.id)).all()
    fields_by_id = {field.id: field for field in fields}
    allowed_member_ids = _get_table_reference_member_ids(db, tenant.id, table_id)
    if isinstance(payload, CreateRecordIn):
        initial_values = payload.initialValues
    else:
        body = payload or {}
        initial_values = body.get("initialValues", body)
    if not isinstance(initial_values, dict):
        raise HTTPException(status_code=400, detail="POST 请求体格式错误")
    upsert_record_values(db, record, fields_by_id, initial_values, allowed_member_ids)
    db.commit()
    db.refresh(record)
    return serialize_record(record)


@router.delete("/records/{record_id}", status_code=204, response_class=Response)
def delete_record(
    record_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> Response:
    record = _ensure_record_exists(db, record_id, tenant.id, request, user.id)
    _ensure_table_access(
        db,
        table_id=record.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_table_button_permission(
        db,
        table_id=record.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        button_key="can_delete_record",
    )
    db.delete(record)
    db.commit()
    return Response(status_code=204)


@router.delete("/fields/{field_id}", status_code=204, response_class=Response)
def delete_field(
    field_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> Response:
    field = _ensure_field_exists(db, field_id, tenant.id, request, user.id)
    _ensure_table_access(
        db,
        table_id=field.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    views = db.scalars(select(ViewModel).where(ViewModel.table_id == field.table_id, ViewModel.tenant_id == tenant.id)).all()
    for view in views:
        config = view.config_json or {}
        hidden = [item for item in config.get("hiddenFieldIds", []) if item != field_id]
        field_order = [item for item in config.get("fieldOrderIds", []) if item != field_id]
        column_widths = dict(config.get("columnWidths", {}))
        if field_id in column_widths:
            del column_widths[field_id]
        config["hiddenFieldIds"] = hidden
        config["fieldOrderIds"] = field_order
        config["columnWidths"] = column_widths
        view.config_json = config
    db.delete(field)
    db.commit()
    return Response(status_code=204)


def _ensure_table_button_permission(
    db: Session,
    *,
    table_id: str,
    tenant_id: str,
    user_id: str,
    request: Request,
    button_key: str,
) -> None:
    role = _get_membership_role(db, user_id, tenant_id)
    if role == "owner":
        return
    permission = db.scalar(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
            TablePermissionModel.user_id == user_id,
        )
    )
    if not permission:
        raise HTTPException(status_code=403, detail="缺少表格按钮权限配置")
    allowed = bool(getattr(permission, button_key, True))
    if allowed:
        return
    write_audit_log(
        db,
        action="table_button_permission_denied",
        result="denied",
        request=request,
        user_id=user_id,
        tenant_id=tenant_id,
        resource_type="table",
        resource_id=table_id,
        detail=f"button={button_key}",
    )
    raise HTTPException(status_code=403, detail="无该表按钮操作权限")


def _get_table_reference_member_ids(db: Session, tenant_id: str, table_id: str) -> set[str]:
    permissions = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    return {
        item.user_id
        for item in permissions
        if item.can_read or item.can_write
    }


def _filter_views_for_user(
    db: Session,
    tenant_id: str,
    user_id: str,
    views: list[ViewModel],
) -> list[ViewModel]:
    role = _get_membership_role(db, user_id, tenant_id)
    if role == "owner":
        return views
    view_ids = [item.id for item in views]
    if not view_ids:
        return []
    permissions = db.scalars(
        select(ViewPermissionModel).where(
            ViewPermissionModel.tenant_id == tenant_id,
            ViewPermissionModel.user_id == user_id,
            ViewPermissionModel.view_id.in_(view_ids),
        )
    ).all()
    if not permissions:
        return []
    allowed_ids = {
        item.view_id
        for item in permissions
        if item.can_read or item.can_write
    }
    return [item for item in views if item.id in allowed_ids]


def _ensure_view_access(
    db: Session,
    *,
    view_id: str,
    tenant_id: str,
    user_id: str,
    request: Request,
    access: str,
    expected_table_id: str | None = None,
) -> ViewModel:
    view = _ensure_view_exists(db, view_id, tenant_id, request, user_id, expected_table_id=expected_table_id)
    _ensure_table_access(
        db,
        table_id=view.table_id,
        tenant_id=tenant_id,
        user_id=user_id,
        request=request,
        access="read" if access == "read" else "write",
    )
    role = _get_membership_role(db, user_id, tenant_id)
    if role == "owner":
        return view
    permission = db.scalar(
        select(ViewPermissionModel).where(
            ViewPermissionModel.tenant_id == tenant_id,
            ViewPermissionModel.view_id == view_id,
            ViewPermissionModel.user_id == user_id,
        )
    )
    if not permission:
        write_audit_log(
            db,
            action="view_permission_denied",
            result="denied",
            request=request,
            user_id=user_id,
            tenant_id=tenant_id,
            resource_type="view",
            resource_id=view_id,
            detail=f"required={access};missing_row=true",
        )
        raise HTTPException(status_code=403, detail="无该视图访问权限")
    has_access = permission.can_write if access == "write" else (permission.can_read or permission.can_write)
    if has_access:
        return view
    write_audit_log(
        db,
        action="view_permission_denied",
        result="denied",
        request=request,
        user_id=user_id,
        tenant_id=tenant_id,
        resource_type="view",
        resource_id=view_id,
        detail=f"required={access}",
    )
    raise HTTPException(status_code=403, detail="无该视图访问权限")


def _ensure_record_exists(
    db: Session,
    record_id: str,
    tenant_id: str,
    request: Request,
    user_id: str,
) -> RecordModel:
    record = db.scalar(
        select(RecordModel)
        .where(RecordModel.id == record_id, RecordModel.tenant_id == tenant_id)
        .options(joinedload(RecordModel.values))
    )
    if record:
        return record
    exists_any = db.scalar(select(RecordModel).where(RecordModel.id == record_id))
    if exists_any:
        _audit_cross_tenant_access(
            db,
            request=request,
            user_id=user_id,
            tenant_id=tenant_id,
            resource_type="record",
            resource_id=record_id,
        )
    raise HTTPException(status_code=404, detail="记录不存在")


def _ensure_field_exists(
    db: Session,
    field_id: str,
    tenant_id: str,
    request: Request,
    user_id: str,
) -> FieldModel:
    field = db.scalar(select(FieldModel).where(FieldModel.id == field_id, FieldModel.tenant_id == tenant_id))
    if field:
        return field
    exists_any = db.scalar(select(FieldModel).where(FieldModel.id == field_id))
    if exists_any:
        _audit_cross_tenant_access(
            db,
            request=request,
            user_id=user_id,
            tenant_id=tenant_id,
            resource_type="field",
            resource_id=field_id,
        )
    raise HTTPException(status_code=404, detail="字段不存在")


def _parse_json_list(raw: str | None, name: str) -> list[dict[str, Any]] | None:
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{name} 参数不是合法 JSON") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail=f"{name} 参数必须是数组")
    for item in parsed:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"{name} 数组元素必须是对象")
    return parsed

