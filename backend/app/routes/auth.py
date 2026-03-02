from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import (
    ACCESS_TOKEN_MINUTES,
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_tenant,
    get_current_user,
    hash_password,
    set_refresh_cookie,
    verify_password,
    write_audit_log,
)
from ..db import get_db
from ..models import MembershipModel, TenantModel, UserModel
from ..schemas import AuthTokenOut, FirstLoginChangePasswordIn, LoginIn, MeOut, TenantOut, UserProfileOut

router = APIRouter()


@router.post("/auth/login", response_model=AuthTokenOut)
def login(payload: LoginIn, response: Response, request: Request, db: Session = Depends(get_db)) -> AuthTokenOut:
    username = payload.username.strip()
    password = payload.password
    user = db.scalar(select(UserModel).where(or_(UserModel.username == username, UserModel.account == username)))
    if not user or not verify_password(password, user.password_hash):
        write_audit_log(
            db,
            action="login",
            result="failed",
            request=request,
            user_id=user.id if user else None,
            detail="invalid_credentials",
        )
        raise HTTPException(status_code=401, detail="账号或密码错误")
    if user.must_change_password:
        write_audit_log(
            db,
            action="login",
            result="forbidden",
            request=request,
            user_id=user.id,
            detail="first_password_change_required",
        )
        raise HTTPException(status_code=403, detail="首次登录请先修改密码")

    memberships = db.scalars(select(MembershipModel).where(MembershipModel.user_id == user.id)).all()
    if not memberships:
        raise HTTPException(status_code=403, detail="用户未加入任何租户")
    tenant_ids = {item.tenant_id for item in memberships}
    tenant_id = user.default_tenant_id if user.default_tenant_id in tenant_ids else memberships[0].tenant_id
    tenant = db.scalar(select(TenantModel).where(TenantModel.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=403, detail="默认租户不存在")

    access_token = create_access_token(user.id, tenant.id)
    refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, refresh_token)
    write_audit_log(db, action="login", result="success", request=request, user_id=user.id, tenant_id=tenant.id)
    return AuthTokenOut(
        accessToken=access_token,
        tokenType="bearer",
        expiresIn=ACCESS_TOKEN_MINUTES * 60,
        currentTenant=TenantOut(id=tenant.id, name=tenant.name),
    )


@router.post("/auth/first-login/change-password")
def first_login_change_password(payload: FirstLoginChangePasswordIn, db: Session = Depends(get_db)) -> dict[str, str]:
    account = payload.account.strip()
    new_password = payload.newPassword
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="新密码至少 8 位")
    user = db.scalar(select(UserModel).where(or_(UserModel.account == account, UserModel.username == account)))
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="原密码错误")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.commit()
    return {"detail": "密码修改成功"}


@router.post("/auth/logout")
def logout(response: Response) -> dict[str, str]:
    clear_refresh_cookie(response)
    return {"detail": "已退出登录"}


@router.post("/auth/refresh", response_model=AuthTokenOut)
def refresh_token(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> AuthTokenOut:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="刷新凭证缺失")
    payload = decode_token(refresh_token, "refresh")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="刷新凭证无效")
    user = db.scalar(select(UserModel).where(UserModel.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    memberships = db.scalars(select(MembershipModel).where(MembershipModel.user_id == user.id)).all()
    if not memberships:
        raise HTTPException(status_code=403, detail="用户未加入任何租户")
    tenant_ids = {item.tenant_id for item in memberships}
    tenant_id = user.default_tenant_id if user.default_tenant_id in tenant_ids else memberships[0].tenant_id
    tenant = db.scalar(select(TenantModel).where(TenantModel.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=403, detail="租户不存在")
    access_token = create_access_token(user.id, tenant.id)
    new_refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, new_refresh_token)
    return AuthTokenOut(
        accessToken=access_token,
        tokenType="bearer",
        expiresIn=ACCESS_TOKEN_MINUTES * 60,
        currentTenant=TenantOut(id=tenant.id, name=tenant.name),
    )


@router.get("/auth/me", response_model=MeOut)
def me(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> MeOut:
    memberships = db.scalars(
        select(MembershipModel).where(MembershipModel.user_id == user.id).order_by(MembershipModel.tenant_id.asc())
    ).all()
    tenant_map = {
        item.id: item
        for item in db.scalars(select(TenantModel).where(TenantModel.id.in_([m.tenant_id for m in memberships]))).all()
    }
    current_membership = next((item for item in memberships if item.tenant_id == tenant.id), None)
    role = current_membership.role if current_membership else "member"
    role_key = current_membership.role_key if current_membership and current_membership.role != "owner" else role
    return MeOut(
        user=UserProfileOut(
            id=user.id,
            username=user.username,
            account=user.account,
            email=user.email,
            mobile=user.mobile,
            defaultTenantId=user.default_tenant_id,
        ),
        currentTenant=TenantOut(id=tenant.id, name=tenant.name),
        role=role,
        roleKey=role_key,
        tenants=[TenantOut(id=item.id, name=item.name) for item in tenant_map.values()],
    )
