from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import write_audit_log
from .models import TableModel, TablePermissionModel, ViewModel
from .tenant_helpers import _get_membership_role


def _audit_cross_tenant_access(
    db: Session,
    *,
    request: Request,
    user_id: str,
    tenant_id: str,
    resource_type: str,
    resource_id: str,
) -> None:
    write_audit_log(
        db,
        action="cross_tenant_access",
        result="denied",
        request=request,
        user_id=user_id,
        tenant_id=tenant_id,
        resource_type=resource_type,
        resource_id=resource_id,
        detail="tenant_scope_violation",
    )


def _ensure_table_exists(
    db: Session,
    table_id: str,
    tenant_id: str,
    request: Request,
    user_id: str,
) -> TableModel:
    table = db.scalar(select(TableModel).where(TableModel.id == table_id, TableModel.tenant_id == tenant_id))
    if table:
        return table
    exists_any = db.scalar(select(TableModel).where(TableModel.id == table_id))
    if exists_any:
        _audit_cross_tenant_access(
            db,
            request=request,
            user_id=user_id,
            tenant_id=tenant_id,
            resource_type="table",
            resource_id=table_id,
        )
    raise HTTPException(status_code=404, detail="数据表不存在")


def _ensure_view_exists(
    db: Session,
    view_id: str,
    tenant_id: str,
    request: Request,
    user_id: str,
    expected_table_id: str | None = None,
) -> ViewModel:
    stmt = select(ViewModel).where(ViewModel.id == view_id, ViewModel.tenant_id == tenant_id)
    if expected_table_id:
        stmt = stmt.where(ViewModel.table_id == expected_table_id)
    view = db.scalar(stmt)
    if view:
        return view
    exists_any = db.scalar(select(ViewModel).where(ViewModel.id == view_id))
    if exists_any:
        _audit_cross_tenant_access(
            db,
            request=request,
            user_id=user_id,
            tenant_id=tenant_id,
            resource_type="view",
            resource_id=view_id,
        )
    raise HTTPException(status_code=404, detail="视图不存在")


def _ensure_table_access(
    db: Session,
    *,
    table_id: str,
    tenant_id: str,
    user_id: str,
    request: Request,
    access: str,
) -> TableModel:
    table = _ensure_table_exists(db, table_id, tenant_id, request, user_id)
    role = _get_membership_role(db, user_id, tenant_id)
    if role == "owner":
        return table

    permission = db.scalar(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
            TablePermissionModel.user_id == user_id,
        )
    )
    has_access = False
    if permission:
        has_access = permission.can_write if access == "write" else (permission.can_read or permission.can_write)
    if has_access:
        return table

    write_audit_log(
        db,
        action="table_permission_denied",
        result="denied",
        request=request,
        user_id=user_id,
        tenant_id=tenant_id,
        resource_type="table",
        resource_id=table_id,
        detail=f"required={access}",
    )
    raise HTTPException(status_code=403, detail="无该表访问权限")
