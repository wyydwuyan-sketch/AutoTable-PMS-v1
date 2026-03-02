from __future__ import annotations

import os


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_str(name: str, default: str) -> str:
    value = (os.getenv(name) or "").strip()
    return value or default


# 测试模式账号（默认开启，便于本地联调）
TEST_ADMIN_USERNAME = _env_str("TEST_ADMIN_USERNAME", "admin")
TEST_ADMIN_PASSWORD = _env_str("TEST_ADMIN_PASSWORD", "admin123")

# JWT 启动策略：
# - 默认允许使用内置开发密钥，避免每次启动都手动设置 JWT_SECRET
# - 生产环境可将 REQUIRE_JWT_SECRET_ON_STARTUP=true 强制要求环境变量
REQUIRE_JWT_SECRET_ON_STARTUP = _env_bool("REQUIRE_JWT_SECRET_ON_STARTUP", False)
JWT_SECRET = _env_str(
    "JWT_SECRET",
    "dev-jwt-secret-for-local-testing-change-me-20260224",
)
