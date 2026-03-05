from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..access_helpers import _audit_cross_tenant_access, _ensure_table_access, _ensure_view_exists
from ..auth import get_current_tenant, get_current_user, write_audit_log
from ..constants import DEFAULT_VIEW_CONFIG
from ..db import get_db
from ..models import FieldModel, RecordModel, TablePermissionModel, TenantModel, UserModel, ViewModel, ViewPermissionModel
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
    ViewCreateIn,
    ViewOut,
    ViewPatchIn,
)
from ..services import (
    apply_filters_and_sorts,
    now_utc_naive,
    serialize_record,
    to_field_out,
    to_view_out,
    upsert_record_values,
)
from ..tenant_helpers import _get_membership_role, _next_id

router = APIRouter()

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
    views = sorted(views, key=lambda item: (int((item.config_json or {}).get("order", 0)), item.id))
    return [to_view_out(view) for view in views]


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
    existing_views = db.scalars(
        select(ViewModel).where(ViewModel.table_id == table_id, ViewModel.tenant_id == tenant.id)
    ).all()
    next_order = max((int((view.config_json or {}).get("order", 0)) for view in existing_views), default=-1) + 1
    config_json = payload.config.model_dump() if payload.config else dict(DEFAULT_VIEW_CONFIG)
    if "order" not in config_json:
        config_json["order"] = next_order
    if "isEnabled" not in config_json:
        config_json["isEnabled"] = True

    created = ViewModel(
        id=_next_id("viw"),
        tenant_id=tenant.id,
        table_id=table_id,
        name=payload.name,
        type=payload.type,
        config_json=config_json,
    )
    db.add(created)
    db.flush()
    db.add(
        ViewPermissionModel(
            tenant_id=tenant.id,
            view_id=created.id,
            user_id=user.id,
            can_read=True,
            can_write=True,
            created_at=now_utc_naive(),
        )
    )
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
    created_view = ViewModel(
        id=_next_id("viw"),
        tenant_id=tenant.id,
        table_id=table_id,
        name=view_name,
        type=payload.viewType,
        config_json={**dict(DEFAULT_VIEW_CONFIG), "order": next_order},
    )
    db.add(created_view)
    db.flush()
    db.add(
        ViewPermissionModel(
            tenant_id=tenant.id,
            view_id=created_view.id,
            user_id=user.id,
            can_read=True,
            can_write=True,
            created_at=now_utc_naive(),
        )
    )

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
        view.type = payload.type
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
    view_count = db.scalar(
        select(func.count()).select_from(ViewModel).where(ViewModel.table_id == view.table_id, ViewModel.tenant_id == tenant.id)
    ) or 0
    if int(view_count) <= 1:
        raise HTTPException(status_code=400, detail="至少保留一个视图，不能删除最后一个视图")
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

    stmt = (
        select(RecordModel)
        .where(*record_where)
        .options(joinedload(RecordModel.values))
        .order_by(RecordModel.created_at.desc(), RecordModel.id.desc())
    )
    records = db.scalars(stmt).unique().all()

    fields = db.scalars(select(FieldModel).where(FieldModel.table_id == table_id, FieldModel.tenant_id == tenant_id)).all()
    fields_by_id = {field.id: field for field in fields}
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

