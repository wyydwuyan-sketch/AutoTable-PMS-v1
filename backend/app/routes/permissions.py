from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access_helpers import _ensure_table_access, _ensure_table_exists, _ensure_view_exists
from ..auth import get_current_tenant, get_current_user, write_audit_log
from ..constants import DEFAULT_BUTTON_PERMISSIONS
from ..db import get_db
from ..models import (
    MembershipModel,
    TablePermissionModel,
    TenantModel,
    TenantRoleModel,
    UserModel,
    ViewPermissionModel,
)
from ..schemas import (
    TableButtonPermissionItemOut,
    TableButtonPermissionPatchIn,
    TableButtonPermissionSet,
    TablePermissionItemOut,
    TablePermissionPatchIn,
    ViewPermissionItemOut,
    ViewPermissionPatchIn,
)
from ..services import now_utc_naive
from ..tenant_helpers import _ensure_builtin_roles, _ensure_manage_table_permissions_allowed, _get_membership_role

router = APIRouter()


def _to_table_button_permission_set(permission: TablePermissionModel | None) -> TableButtonPermissionSet:
    if not permission:
        return TableButtonPermissionSet(
            canCreateRecord=DEFAULT_BUTTON_PERMISSIONS["can_create_record"],
            canDeleteRecord=DEFAULT_BUTTON_PERMISSIONS["can_delete_record"],
            canImportRecords=DEFAULT_BUTTON_PERMISSIONS["can_import_records"],
            canExportRecords=DEFAULT_BUTTON_PERMISSIONS["can_export_records"],
            canManageFilters=DEFAULT_BUTTON_PERMISSIONS["can_manage_filters"],
            canManageSorts=DEFAULT_BUTTON_PERMISSIONS["can_manage_sorts"],
        )
    return TableButtonPermissionSet(
        canCreateRecord=permission.can_create_record,
        canDeleteRecord=permission.can_delete_record,
        canImportRecords=permission.can_import_records,
        canExportRecords=permission.can_export_records,
        canManageFilters=permission.can_manage_filters,
        canManageSorts=permission.can_manage_sorts,
    )


@router.get("/tables/{table_id}/permissions", response_model=list[TablePermissionItemOut])
def get_table_permissions(
    table_id: str,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TablePermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_table_exists(db, table_id, tenant.id, request, operator.id)
    items = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant.id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    users = {
        item.id: item
        for item in db.scalars(select(UserModel).where(UserModel.id.in_([p.user_id for p in items]))).all()
    }
    return [
        TablePermissionItemOut(
            userId=item.user_id,
            username=users[item.user_id].username if item.user_id in users else item.user_id,
            canRead=item.can_read,
            canWrite=item.can_write,
        )
        for item in items
    ]


@router.put("/tables/{table_id}/permissions", response_model=list[TablePermissionItemOut])
def update_table_permissions(
    table_id: str,
    payload: TablePermissionPatchIn,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TablePermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_table_exists(db, table_id, tenant.id, request, operator.id)
    membership_map = {
        item.user_id: item.role
        for item in db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    }
    target_user_ids = {item.userId for item in payload.items}
    unknown_users = [user_id for user_id in target_user_ids if user_id not in membership_map]
    if unknown_users:
        raise HTTPException(status_code=400, detail=f"存在不属于当前租户的成员: {', '.join(unknown_users)}")

    existing = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant.id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    existing_map = {(item.user_id): item for item in existing}

    keep_ids: set[str] = set()
    for item in payload.items:
        # Owner 至少保留读权限，避免权限误删导致“无可引用负责人”
        if membership_map.get(item.userId) == "owner":
            can_read = True
            can_write = True if item.canWrite else False
        else:
            can_read = item.canRead or item.canWrite
            can_write = item.canWrite
        keep_ids.add(item.userId)
        if item.userId in existing_map:
            existing_map[item.userId].can_read = can_read
            existing_map[item.userId].can_write = can_write
        else:
            db.add(
                TablePermissionModel(
                    tenant_id=tenant.id,
                    table_id=table_id,
                    user_id=item.userId,
                    can_read=can_read,
                    can_write=can_write,
                    created_at=now_utc_naive(),
                )
            )

    for user_id, row in existing_map.items():
        if user_id in keep_ids:
            continue
        if membership_map.get(user_id) == "owner":
            row.can_read = True
            row.can_write = True
            continue
        db.delete(row)

    db.commit()
    write_audit_log(
        db,
        action="update_table_permissions",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table_id,
    )
    return get_table_permissions(table_id, request, operator, tenant, db)


@router.post("/tables/{table_id}/permissions/apply-role-defaults", response_model=list[TablePermissionItemOut])
def apply_table_permissions_by_role_defaults(
    table_id: str,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TablePermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_table_exists(db, table_id, tenant.id, request, operator.id)
    _ensure_builtin_roles(db, tenant.id)
    role_map = {
        item.key: item
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id)).all()
    }
    memberships = db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    existing = {
        item.user_id: item
        for item in db.scalars(
            select(TablePermissionModel).where(
                TablePermissionModel.tenant_id == tenant.id,
                TablePermissionModel.table_id == table_id,
            )
        ).all()
    }
    for membership in memberships:
        if membership.role == "owner":
            can_read = True
            can_write = True
        else:
            role = role_map.get(membership.role_key or "member")
            can_read = role.default_table_can_read if role else True
            can_write = role.default_table_can_write if role else False
            if can_write:
                can_read = True
        current = existing.get(membership.user_id)
        if current:
            current.can_read = can_read
            current.can_write = can_write
        else:
            db.add(
                TablePermissionModel(
                    tenant_id=tenant.id,
                    table_id=table_id,
                    user_id=membership.user_id,
                    can_read=can_read,
                    can_write=can_write,
                    created_at=now_utc_naive(),
                )
            )
    db.commit()
    write_audit_log(
        db,
        action="apply_table_permissions_role_defaults",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table_id,
    )
    return get_table_permissions(table_id, request, operator, tenant, db)


@router.get("/tables/{table_id}/button-permissions", response_model=list[TableButtonPermissionItemOut])
def get_table_button_permissions(
    table_id: str,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TableButtonPermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_table_exists(db, table_id, tenant.id, request, operator.id)
    membership_map = {
        item.user_id: item.role
        for item in db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    }
    items = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant.id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    users = {
        item.id: item
        for item in db.scalars(select(UserModel).where(UserModel.id.in_([p.user_id for p in items]))).all()
    }
    return [
        TableButtonPermissionItemOut(
            userId=item.user_id,
            username=users[item.user_id].username if item.user_id in users else item.user_id,
            buttons=(
                TableButtonPermissionSet(
                    canCreateRecord=DEFAULT_BUTTON_PERMISSIONS["can_create_record"],
                    canDeleteRecord=DEFAULT_BUTTON_PERMISSIONS["can_delete_record"],
                    canImportRecords=DEFAULT_BUTTON_PERMISSIONS["can_import_records"],
                    canExportRecords=DEFAULT_BUTTON_PERMISSIONS["can_export_records"],
                    canManageFilters=DEFAULT_BUTTON_PERMISSIONS["can_manage_filters"],
                    canManageSorts=DEFAULT_BUTTON_PERMISSIONS["can_manage_sorts"],
                )
                if membership_map.get(item.user_id) == "owner"
                else _to_table_button_permission_set(item)
            ),
        )
        for item in items
    ]


@router.put("/tables/{table_id}/button-permissions", response_model=list[TableButtonPermissionItemOut])
def update_table_button_permissions(
    table_id: str,
    payload: TableButtonPermissionPatchIn,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TableButtonPermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_table_exists(db, table_id, tenant.id, request, operator.id)
    memberships = db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    membership_map = {item.user_id: item.role for item in memberships}
    target_user_ids = {item.userId for item in payload.items}
    unknown_users = [user_id for user_id in target_user_ids if user_id not in membership_map]
    if unknown_users:
        raise HTTPException(status_code=400, detail=f"存在不属于当前租户的成员: {', '.join(unknown_users)}")

    existing = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant.id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    existing_map = {item.user_id: item for item in existing}
    missing_base_permission = [
        user_id
        for user_id in target_user_ids
        if user_id not in existing_map and membership_map.get(user_id) != "owner"
    ]
    if missing_base_permission:
        raise HTTPException(status_code=400, detail=f"成员缺少该表基础权限: {', '.join(missing_base_permission)}")

    for item in payload.items:
        row = existing_map.get(item.userId)
        if not row:
            row = TablePermissionModel(
                tenant_id=tenant.id,
                table_id=table_id,
                user_id=item.userId,
                can_read=True,
                can_write=True,
                created_at=now_utc_naive(),
            )
            db.add(row)
            existing_map[item.userId] = row
        if membership_map.get(item.userId) == "owner":
            row.can_create_record = True
            row.can_delete_record = True
            row.can_import_records = True
            row.can_export_records = True
            row.can_manage_filters = True
            row.can_manage_sorts = True
            continue
        row.can_create_record = item.buttons.canCreateRecord
        row.can_delete_record = item.buttons.canDeleteRecord
        row.can_import_records = item.buttons.canImportRecords
        row.can_export_records = item.buttons.canExportRecords
        row.can_manage_filters = item.buttons.canManageFilters
        row.can_manage_sorts = item.buttons.canManageSorts

    db.commit()
    write_audit_log(
        db,
        action="update_table_button_permissions",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table_id,
    )
    return get_table_button_permissions(table_id, request, operator, tenant, db)


@router.get("/tables/{table_id}/button-permissions/me", response_model=TableButtonPermissionSet)
def get_my_table_button_permissions(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> TableButtonPermissionSet:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    if _get_membership_role(db, user.id, tenant.id) == "owner":
        return TableButtonPermissionSet(
            canCreateRecord=DEFAULT_BUTTON_PERMISSIONS["can_create_record"],
            canDeleteRecord=DEFAULT_BUTTON_PERMISSIONS["can_delete_record"],
            canImportRecords=DEFAULT_BUTTON_PERMISSIONS["can_import_records"],
            canExportRecords=DEFAULT_BUTTON_PERMISSIONS["can_export_records"],
            canManageFilters=DEFAULT_BUTTON_PERMISSIONS["can_manage_filters"],
            canManageSorts=DEFAULT_BUTTON_PERMISSIONS["can_manage_sorts"],
        )
    permission = db.scalar(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant.id,
            TablePermissionModel.table_id == table_id,
            TablePermissionModel.user_id == user.id,
        )
    )
    return _to_table_button_permission_set(permission)


@router.get("/views/{view_id}/permissions", response_model=list[ViewPermissionItemOut])
def get_view_permissions(
    view_id: str,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[ViewPermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_view_exists(db, view_id, tenant.id, request, operator.id)
    items = db.scalars(
        select(ViewPermissionModel).where(
            ViewPermissionModel.tenant_id == tenant.id,
            ViewPermissionModel.view_id == view_id,
        )
    ).all()
    users = {
        item.id: item
        for item in db.scalars(select(UserModel).where(UserModel.id.in_([p.user_id for p in items]))).all()
    }
    return [
        ViewPermissionItemOut(
            userId=item.user_id,
            username=users[item.user_id].username if item.user_id in users else item.user_id,
            canRead=item.can_read,
            canWrite=item.can_write,
        )
        for item in items
    ]


@router.put("/views/{view_id}/permissions", response_model=list[ViewPermissionItemOut])
def update_view_permissions(
    view_id: str,
    payload: ViewPermissionPatchIn,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[ViewPermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_view_exists(db, view_id, tenant.id, request, operator.id)
    membership_map = {
        item.user_id: item.role
        for item in db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    }
    target_user_ids = {item.userId for item in payload.items}
    unknown_users = [user_id for user_id in target_user_ids if user_id not in membership_map]
    if unknown_users:
        raise HTTPException(status_code=400, detail=f"存在不属于当前租户的成员: {', '.join(unknown_users)}")

    existing = db.scalars(
        select(ViewPermissionModel).where(
            ViewPermissionModel.tenant_id == tenant.id,
            ViewPermissionModel.view_id == view_id,
        )
    ).all()
    existing_map = {(item.user_id): item for item in existing}

    keep_ids: set[str] = set()
    for item in payload.items:
        if membership_map.get(item.userId) == "owner":
            can_read = True
            can_write = True if item.canWrite else False
        else:
            can_read = item.canRead or item.canWrite
            can_write = item.canWrite
        keep_ids.add(item.userId)
        if item.userId in existing_map:
            existing_map[item.userId].can_read = can_read
            existing_map[item.userId].can_write = can_write
        else:
            db.add(
                ViewPermissionModel(
                    tenant_id=tenant.id,
                    view_id=view_id,
                    user_id=item.userId,
                    can_read=can_read,
                    can_write=can_write,
                    created_at=now_utc_naive(),
                )
            )

    for user_id, row in existing_map.items():
        if user_id in keep_ids:
            continue
        if membership_map.get(user_id) == "owner":
            row.can_read = True
            row.can_write = True
            continue
        db.delete(row)

    db.commit()
    write_audit_log(
        db,
        action="update_view_permissions",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="view",
        resource_id=view_id,
    )
    return get_view_permissions(view_id, request, operator, tenant, db)


@router.post("/views/{view_id}/permissions/apply-role-defaults", response_model=list[ViewPermissionItemOut])
def apply_view_permissions_by_role_defaults(
    view_id: str,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[ViewPermissionItemOut]:
    _ensure_manage_table_permissions_allowed(db, operator.id, tenant.id)
    _ensure_view_exists(db, view_id, tenant.id, request, operator.id)
    _ensure_builtin_roles(db, tenant.id)
    role_map = {
        item.key: item
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id)).all()
    }
    memberships = db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    existing = {
        item.user_id: item
        for item in db.scalars(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant.id,
                ViewPermissionModel.view_id == view_id,
            )
        ).all()
    }
    for membership in memberships:
        if membership.role == "owner":
            can_read = True
            can_write = True
        else:
            role = role_map.get(membership.role_key or "member")
            can_read = role.default_table_can_read if role else True
            can_write = role.default_table_can_write if role else False
            if can_write:
                can_read = True
        current = existing.get(membership.user_id)
        if current:
            current.can_read = can_read
            current.can_write = can_write
        else:
            db.add(
                ViewPermissionModel(
                    tenant_id=tenant.id,
                    view_id=view_id,
                    user_id=membership.user_id,
                    can_read=can_read,
                    can_write=can_write,
                    created_at=now_utc_naive(),
                )
            )
    db.commit()
    write_audit_log(
        db,
        action="apply_view_permissions_role_defaults",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="view",
        resource_id=view_id,
    )
    return get_view_permissions(view_id, request, operator, tenant, db)
