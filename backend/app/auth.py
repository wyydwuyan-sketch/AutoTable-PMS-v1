from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import JWT_SECRET, REQUIRE_JWT_SECRET_ON_STARTUP
from .db import get_db
from .models import AuditLogModel, MembershipModel, TenantModel, UserModel


Role = Literal["owner", "member"]

_jwt_secret_from_env = (os.getenv("JWT_SECRET") or "").strip()
if REQUIRE_JWT_SECRET_ON_STARTUP and not _jwt_secret_from_env:
    raise RuntimeError("JWT_SECRET 环境变量未设置，服务拒绝启动。")
if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET 长度不足，至少需要 32 个字符。")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "120"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "30"))
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/auth/refresh"

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(raw_password: str) -> str:
    password_bytes = raw_password.encode("utf-8")
    if len(password_bytes) > 72:
        raise HTTPException(status_code=400, detail="密码长度超过 bcrypt 限制（72 bytes）")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(raw_password: str, password_hash: str) -> bool:
    try:
        password_bytes = raw_password.encode("utf-8")
        if len(password_bytes) > 72:
            return False
        return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))
    except ValueError:
        return False


def _encode_token(payload: dict[str, str], expires_delta: timedelta) -> str:
    exp = datetime.now(timezone.utc) + expires_delta
    token_payload = {**payload, "exp": int(exp.timestamp())}
    return jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: str, tenant_id: str) -> str:
    return _encode_token(
        {"sub": user_id, "tenant_id": tenant_id, "type": "access"},
        timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )


def create_refresh_token(user_id: str) -> str:
    return _encode_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=REFRESH_TOKEN_DAYS),
    )


def decode_token(token: str, expected_type: str) -> dict[str, str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Token 无效或已过期") from exc
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=401, detail="Token 类型错误")
    return {str(k): str(v) for k, v in payload.items()}


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    same_site = os.getenv("REFRESH_COOKIE_SAMESITE", "lax").lower()
    secure = os.getenv("REFRESH_COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite=same_site,  # type: ignore[arg-type]
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_TOKEN_DAYS * 24 * 3600,
    )


def clear_refresh_cookie(response: Response) -> None:
    same_site = os.getenv("REFRESH_COOKIE_SAMESITE", "lax").lower()
    secure = os.getenv("REFRESH_COOKIE_SECURE", "false").lower() == "true"
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=secure,
        samesite=same_site,  # type: ignore[arg-type]
    )


def write_audit_log(
    db: Session,
    *,
    action: str,
    result: str,
    request: Request | None = None,
    user_id: str | None = None,
    tenant_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    detail: str | None = None,
) -> None:
    log = AuditLogModel(
        user_id=user_id,
        tenant_id=tenant_id,
        action=action,
        result=result,
        resource_type=resource_type,
        resource_id=resource_id,
        path=request.url.path if request else None,
        detail=detail,
    )
    db.add(log)
    db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserModel:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="未登录或登录已失效")
    payload = decode_token(credentials.credentials, "access")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token 缺少用户信息")
    user = db.scalar(select(UserModel).where(UserModel.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在或已失效")
    return user


def get_current_tenant(
    user: UserModel = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> TenantModel:
    if not credentials:
        raise HTTPException(status_code=401, detail="未登录或登录已失效")
    payload = decode_token(credentials.credentials, "access")
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Token 缺少租户信息")
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user.id,
            MembershipModel.tenant_id == tenant_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=403, detail="无当前租户访问权限")
    tenant = db.scalar(select(TenantModel).where(TenantModel.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=403, detail="租户不存在")
    return tenant


def require_owner_role(
    tenant: TenantModel = Depends(get_current_tenant),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[UserModel, TenantModel]:
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user.id,
            MembershipModel.tenant_id == tenant.id,
        )
    )
    if not membership or membership.role != "owner":
        raise HTTPException(status_code=403, detail="仅 Owner 可执行该操作")
    return user, tenant
