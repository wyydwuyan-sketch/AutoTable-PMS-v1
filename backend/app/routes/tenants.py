from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (
    ACCESS_TOKEN_MINUTES,
    create_access_token,
    get_current_tenant,
    get_current_user,
    hash_password,
    require_owner_role,
    write_audit_log,
)
from ..db import get_db
from ..models import (
    MembershipModel,
    TenantModel,
    TenantRoleModel,
    UserModel,
)
from ..schemas import (
    AuthTokenOut,
    CreateMemberIn,
    RemoveMemberIn,
    SwitchTenantIn,
    TenantCreateIn,
    TenantMemberOut,
    TenantRoleCreateIn,
    TenantRoleOut,
    TenantRolePatchIn,
    TenantOut,
    UpdateMemberRoleIn,
)
from ..services import now_utc_naive
from ..tenant_helpers import (
    _ensure_builtin_roles,
    _ensure_manage_members_allowed,
    _generate_temporary_password,
    _get_membership,
    _grant_permissions_by_role_defaults,
    _next_id,
    _to_tenant_role_out,
)

router = APIRouter()


@router.get("/tenants", response_model=list[TenantOut])
def get_tenants(
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TenantOut]:
    memberships = db.scalars(select(MembershipModel).where(MembershipModel.user_id == user.id)).all()
    tenant_ids = [item.tenant_id for item in memberships]
    if not tenant_ids:
        return []
    tenants = db.scalars(select(TenantModel).where(TenantModel.id.in_(tenant_ids))).all()
    return [TenantOut(id=item.id, name=item.name) for item in tenants]


@router.post("/tenants", response_model=TenantOut)
def create_tenant(
    payload: TenantCreateIn,
    request: Request,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="租户名称不能为空")
    tenant = TenantModel(id=_next_id("tenant"), name=name)
    db.add(tenant)
    db.flush()
    _ensure_builtin_roles(db, tenant.id)
    db.add(
        MembershipModel(
            user_id=user.id,
            tenant_id=tenant.id,
            role="owner",
            role_key="owner",
            created_at=now_utc_naive(),
        )
    )
    if not user.default_tenant_id:
        user.default_tenant_id = tenant.id
    db.commit()
    write_audit_log(
        db,
        action="create_tenant",
        result="success",
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
        resource_type="tenant",
        resource_id=tenant.id,
    )
    return TenantOut(id=tenant.id, name=tenant.name)


@router.post("/tenants/switch", response_model=AuthTokenOut)
def switch_tenant(
    payload: SwitchTenantIn,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthTokenOut:
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user.id,
            MembershipModel.tenant_id == payload.tenantId,
        )
    )
    if not membership:
        raise HTTPException(status_code=403, detail="无目标租户访问权限")
    tenant = db.scalar(select(TenantModel).where(TenantModel.id == payload.tenantId))
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")
    user.default_tenant_id = tenant.id
    db.commit()
    access_token = create_access_token(user.id, tenant.id)
    return AuthTokenOut(
        accessToken=access_token,
        tokenType="bearer",
        expiresIn=ACCESS_TOKEN_MINUTES * 60,
        currentTenant=TenantOut(id=tenant.id, name=tenant.name),
    )


@router.get("/tenants/current/members", response_model=list[TenantMemberOut])
def list_current_tenant_members(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TenantMemberOut]:
    _ensure_manage_members_allowed(db, user.id, tenant.id)
    _ensure_builtin_roles(db, tenant.id)
    memberships = db.scalars(select(MembershipModel).where(MembershipModel.tenant_id == tenant.id)).all()
    users = {
        item.id: item
        for item in db.scalars(select(UserModel).where(UserModel.id.in_([m.user_id for m in memberships]))).all()
    }
    role_map = {
        item.key: item
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id)).all()
    }
    result: list[TenantMemberOut] = []
    for item in memberships:
        member_user = users.get(item.user_id)
        if not member_user:
            continue
        role_key = (item.role_key or "member") if item.role != "owner" else "owner"
        role_name = "Owner" if item.role == "owner" else (role_map.get(role_key).name if role_map.get(role_key) else role_key)
        result.append(
            TenantMemberOut(
                userId=member_user.id,
                username=member_user.username,
                role=item.role,
                roleKey=role_key,
                roleName=role_name,
            )
        )
    return result


@router.post("/tenants/current/members", response_model=TenantMemberOut)
def create_member(
    payload: CreateMemberIn,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> TenantMemberOut:
    _ensure_manage_members_allowed(db, operator.id, tenant.id)
    _ensure_builtin_roles(db, tenant.id)
    username = payload.username.strip()
    account = (payload.account or payload.username).strip()
    password = (payload.password or "").strip() or None
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    if not account:
        raise HTTPException(status_code=400, detail="账号不能为空")
    if password and len(password) < 8:
        raise HTTPException(status_code=400, detail="密码至少 8 位")
    role_key = (payload.roleKey or "member").strip() or "member"
    role = db.scalar(
        select(TenantRoleModel).where(
            TenantRoleModel.tenant_id == tenant.id,
            TenantRoleModel.key == role_key,
        )
    )
    if not role:
        raise HTTPException(status_code=400, detail=f"职级不存在: {role_key}")

    existing_by_account = db.scalar(select(UserModel).where(UserModel.account == account))
    existing_by_username = db.scalar(select(UserModel).where(UserModel.username == username))
    if existing_by_account and existing_by_username and existing_by_account.id != existing_by_username.id:
        raise HTTPException(status_code=400, detail="账号或用户名已存在")
    user = existing_by_account or existing_by_username
    temporary_password: str | None = None
    if not user:
        initial_password = password
        must_change_password = False
        if not initial_password:
            initial_password = _generate_temporary_password()
            must_change_password = True
            temporary_password = initial_password
        user = UserModel(
            id=_next_id("usr"),
            username=username,
            account=account,
            password_hash=hash_password(initial_password),
            email=(payload.email or "").strip() or None,
            mobile=(payload.mobile or "").strip() or None,
            must_change_password=must_change_password,
            default_tenant_id=tenant.id,
            created_at=now_utc_naive(),
        )
        db.add(user)
        db.flush()
    else:
        if user.account != account and existing_by_account and existing_by_account.id != user.id:
            raise HTTPException(status_code=400, detail="账号已存在")
        if user.username != username and existing_by_username and existing_by_username.id != user.id:
            raise HTTPException(status_code=400, detail="用户名已存在")
        if payload.email is not None:
            user.email = (payload.email or "").strip() or None
        if payload.mobile is not None:
            user.mobile = (payload.mobile or "").strip() or None
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user.id,
            MembershipModel.tenant_id == tenant.id,
        )
    )
    if membership:
        raise HTTPException(status_code=400, detail="该用户已在当前租户内")
    db.add(
        MembershipModel(
            user_id=user.id,
            tenant_id=tenant.id,
            role="member",
            role_key=role.key,
            created_at=now_utc_naive(),
        )
    )
    if not user.default_tenant_id:
        user.default_tenant_id = tenant.id
    _grant_permissions_by_role_defaults(db, tenant.id, user.id, role)
    db.commit()
    write_audit_log(
        db,
        action="create_member",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="user",
        resource_id=user.id,
    )
    return TenantMemberOut(
        userId=user.id,
        username=user.username,
        role="member",
        roleKey=role.key,
        roleName=role.name,
        temporaryPassword=temporary_password,
    )


@router.patch("/tenants/current/members/{member_user_id}/role", response_model=TenantMemberOut)
def update_member_role(
    member_user_id: str,
    payload: UpdateMemberRoleIn,
    request: Request,
    current: tuple[UserModel, TenantModel] = Depends(require_owner_role),
    db: Session = Depends(get_db),
) -> TenantMemberOut:
    operator, tenant = current
    _ensure_builtin_roles(db, tenant.id)
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == member_user_id,
            MembershipModel.tenant_id == tenant.id,
        )
    )
    if not membership:
        raise HTTPException(status_code=404, detail="成员不存在")
    if membership.role == "owner":
        raise HTTPException(status_code=400, detail="Owner 不支持切换职级")
    role = db.scalar(
        select(TenantRoleModel).where(
            TenantRoleModel.tenant_id == tenant.id,
            TenantRoleModel.key == payload.roleKey,
        )
    )
    if not role:
        raise HTTPException(status_code=400, detail=f"职级不存在: {payload.roleKey}")
    membership.role_key = role.key
    _grant_permissions_by_role_defaults(db, tenant.id, member_user_id, role)
    db.commit()
    user = db.scalar(select(UserModel).where(UserModel.id == member_user_id))
    username = user.username if user else member_user_id
    write_audit_log(
        db,
        action="update_member_role",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="user",
        resource_id=member_user_id,
        detail=f"role_key={role.key}",
    )
    return TenantMemberOut(
        userId=member_user_id,
        username=username,
        role="member",
        roleKey=role.key,
        roleName=role.name,
    )


@router.delete("/tenants/current/members/{member_user_id}")
def remove_member(
    member_user_id: str,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    _ensure_manage_members_allowed(db, operator.id, tenant.id)
    if operator.id == member_user_id:
        raise HTTPException(status_code=400, detail="不能移除自己")
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == member_user_id,
            MembershipModel.tenant_id == tenant.id,
        )
    )
    if not membership:
        raise HTTPException(status_code=404, detail="成员不存在")
    if membership.role == "owner":
        operator_membership = _get_membership(db, operator.id, tenant.id)
        if not operator_membership or operator_membership.role != "owner":
            raise HTTPException(status_code=403, detail="仅 Owner 可移除 Owner")
        owner_count = db.scalar(
            select(func.count())
            .select_from(MembershipModel)
            .where(MembershipModel.tenant_id == tenant.id, MembershipModel.role == "owner")
        ) or 0
        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="不能移除最后一个 Owner")
    db.delete(membership)
    db.commit()
    write_audit_log(
        db,
        action="remove_member",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="user",
        resource_id=member_user_id,
    )
    return {"detail": "已移除成员"}


@router.post("/tenants/current/members/remove", deprecated=True)
def remove_member_compat(
    payload: RemoveMemberIn,
    request: Request,
    operator: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    return remove_member(payload.userId, request, operator, tenant, db)


@router.get("/tenants/current/roles", response_model=list[TenantRoleOut])
def list_tenant_roles(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[TenantRoleOut]:
    _ensure_manage_members_allowed(db, user.id, tenant.id)
    _ensure_builtin_roles(db, tenant.id)
    roles = db.scalars(
        select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id).order_by(TenantRoleModel.key.asc())
    ).all()
    return [_to_tenant_role_out(item) for item in roles]


@router.post("/tenants/current/roles", response_model=TenantRoleOut)
def create_tenant_role(
    payload: TenantRoleCreateIn,
    request: Request,
    current: tuple[UserModel, TenantModel] = Depends(require_owner_role),
    db: Session = Depends(get_db),
) -> TenantRoleOut:
    operator, tenant = current
    key = payload.key.strip().lower()
    name = payload.name.strip()
    if not key or not name:
        raise HTTPException(status_code=400, detail="职级 key / 名称不能为空")
    if key == "owner":
        raise HTTPException(status_code=400, detail="owner 为保留职级 key")
    exists = db.scalar(
        select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id, TenantRoleModel.key == key)
    )
    if exists:
        raise HTTPException(status_code=400, detail="职级 key 已存在")
    role = TenantRoleModel(
        tenant_id=tenant.id,
        key=key,
        name=name,
        can_manage_members=payload.canManageMembers,
        can_manage_permissions=payload.canManagePermissions,
        default_table_can_read=payload.defaultTableCanRead,
        default_table_can_write=payload.defaultTableCanWrite,
        created_at=now_utc_naive(),
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    write_audit_log(
        db,
        action="create_tenant_role",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="role",
        resource_id=role.key,
    )
    return _to_tenant_role_out(role)


@router.patch("/tenants/current/roles/{role_key}", response_model=TenantRoleOut)
def patch_tenant_role(
    role_key: str,
    payload: TenantRolePatchIn,
    request: Request,
    current: tuple[UserModel, TenantModel] = Depends(require_owner_role),
    db: Session = Depends(get_db),
) -> TenantRoleOut:
    operator, tenant = current
    if role_key in {"owner", "member"}:
        raise HTTPException(status_code=400, detail="内置职级不支持修改 key")
    role = db.scalar(
        select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id, TenantRoleModel.key == role_key)
    )
    if not role:
        raise HTTPException(status_code=404, detail="职级不存在")
    if payload.name is not None:
        next_name = payload.name.strip()
        if not next_name:
            raise HTTPException(status_code=400, detail="职级名称不能为空")
        role.name = next_name
    if payload.canManageMembers is not None:
        role.can_manage_members = payload.canManageMembers
    if payload.canManagePermissions is not None:
        role.can_manage_permissions = payload.canManagePermissions
    if payload.defaultTableCanRead is not None:
        role.default_table_can_read = payload.defaultTableCanRead or bool(role.default_table_can_write)
    if payload.defaultTableCanWrite is not None:
        role.default_table_can_write = payload.defaultTableCanWrite
        if role.default_table_can_write:
            role.default_table_can_read = True
    db.commit()
    db.refresh(role)
    write_audit_log(
        db,
        action="update_tenant_role",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="role",
        resource_id=role.key,
    )
    return _to_tenant_role_out(role)


@router.delete("/tenants/current/roles/{role_key}")
def delete_tenant_role(
    role_key: str,
    request: Request,
    current: tuple[UserModel, TenantModel] = Depends(require_owner_role),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    operator, tenant = current
    if role_key in {"owner", "member"}:
        raise HTTPException(status_code=400, detail="内置职级不能删除")
    role = db.scalar(
        select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant.id, TenantRoleModel.key == role_key)
    )
    if not role:
        raise HTTPException(status_code=404, detail="职级不存在")
    in_use = db.scalar(
        select(func.count())
        .select_from(MembershipModel)
        .where(
            MembershipModel.tenant_id == tenant.id,
            MembershipModel.role_key == role_key,
        )
    ) or 0
    if int(in_use) > 0:
        raise HTTPException(status_code=400, detail="职级仍被成员使用，不能删除")
    db.delete(role)
    db.commit()
    write_audit_log(
        db,
        action="delete_tenant_role",
        result="success",
        request=request,
        user_id=operator.id,
        tenant_id=tenant.id,
        resource_type="role",
        resource_id=role_key,
    )
    return {"detail": "已删除职级"}
