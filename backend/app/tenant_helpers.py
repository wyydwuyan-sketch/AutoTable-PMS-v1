from __future__ import annotations

import secrets
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .constants import BUILTIN_TENANT_ROLE_DEFAULTS
from .models import (
    MembershipModel,
    TableModel,
    TablePermissionModel,
    TenantRoleModel,
    ViewModel,
    ViewPermissionModel,
)
from .schemas import TenantRoleOut
from .services import now_utc_naive


def _next_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _generate_temporary_password() -> str:
    # 通过高熵随机值生成一次性初始口令，避免固定默认密码。
    return secrets.token_urlsafe(12)


def _get_membership_role(db: Session, user_id: str, tenant_id: str) -> str | None:
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user_id,
            MembershipModel.tenant_id == tenant_id,
        )
    )
    return membership.role if membership else None


def _get_membership(db: Session, user_id: str, tenant_id: str) -> MembershipModel | None:
    return db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user_id,
            MembershipModel.tenant_id == tenant_id,
        )
    )


def _ensure_builtin_roles(db: Session, tenant_id: str) -> None:
    existing_keys = {
        item.key
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant_id)).all()
    }
    changed = False
    for key, name, can_manage_members, can_manage_permissions, can_read, can_write in BUILTIN_TENANT_ROLE_DEFAULTS:
        if key in existing_keys:
            continue
        db.add(
            TenantRoleModel(
                tenant_id=tenant_id,
                key=key,
                name=name,
                can_manage_members=can_manage_members,
                can_manage_permissions=can_manage_permissions,
                default_table_can_read=can_read,
                default_table_can_write=can_write,
                created_at=now_utc_naive(),
            )
        )
        changed = True
    if changed:
        db.flush()


def _ensure_manage_members_allowed(db: Session, user_id: str, tenant_id: str) -> None:
    membership = _get_membership(db, user_id, tenant_id)
    if not membership:
        raise HTTPException(status_code=403, detail="当前租户无成员权限")
    if membership.role == "owner":
        return
    role = db.scalar(
        select(TenantRoleModel).where(
            TenantRoleModel.tenant_id == tenant_id,
            TenantRoleModel.key == membership.role_key,
        )
    )
    if role and role.can_manage_members:
        return
    raise HTTPException(status_code=403, detail="无成员管理权限")


def _ensure_manage_table_permissions_allowed(db: Session, user_id: str, tenant_id: str) -> None:
    membership = _get_membership(db, user_id, tenant_id)
    if not membership:
        raise HTTPException(status_code=403, detail="当前租户无权限")
    if membership.role == "owner":
        return
    role = db.scalar(
        select(TenantRoleModel).where(
            TenantRoleModel.tenant_id == tenant_id,
            TenantRoleModel.key == membership.role_key,
        )
    )
    if role and role.can_manage_permissions:
        return
    raise HTTPException(status_code=403, detail="无表格权限管理权限")


def _to_tenant_role_out(item: TenantRoleModel) -> TenantRoleOut:
    return TenantRoleOut(
        key=item.key,
        name=item.name,
        canManageMembers=item.can_manage_members,
        canManagePermissions=item.can_manage_permissions,
        defaultTableCanRead=item.default_table_can_read,
        defaultTableCanWrite=item.default_table_can_write,
    )


def _grant_permissions_by_role_defaults(db: Session, tenant_id: str, user_id: str, role: TenantRoleModel) -> None:
    table_ids = [
        item.id
        for item in db.scalars(select(TableModel).where(TableModel.tenant_id == tenant_id)).all()
    ]
    for table_id in table_ids:
        perm = db.scalar(
            select(TablePermissionModel).where(
                TablePermissionModel.tenant_id == tenant_id,
                TablePermissionModel.table_id == table_id,
                TablePermissionModel.user_id == user_id,
            )
        )
        can_read = role.default_table_can_read or role.default_table_can_write
        can_write = role.default_table_can_write
        if perm:
            perm.can_read = can_read
            perm.can_write = can_write
            continue
        db.add(
            TablePermissionModel(
                tenant_id=tenant_id,
                table_id=table_id,
                user_id=user_id,
                can_read=can_read,
                can_write=can_write,
                created_at=now_utc_naive(),
            )
        )
    view_ids = [
        item.id
        for item in db.scalars(select(ViewModel).where(ViewModel.tenant_id == tenant_id)).all()
    ]
    for view_id in view_ids:
        perm = db.scalar(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant_id,
                ViewPermissionModel.view_id == view_id,
                ViewPermissionModel.user_id == user_id,
            )
        )
        can_read = role.default_table_can_read or role.default_table_can_write
        can_write = role.default_table_can_write
        if perm:
            perm.can_read = can_read
            perm.can_write = can_write
            continue
        db.add(
            ViewPermissionModel(
                tenant_id=tenant_id,
                view_id=view_id,
                user_id=user_id,
                can_read=can_read,
                can_write=can_write,
                created_at=now_utc_naive(),
            )
        )
