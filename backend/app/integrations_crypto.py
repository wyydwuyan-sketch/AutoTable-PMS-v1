from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException


_FERNET: Fernet | None = None
_KEY_ENV_NAME = "AUTOTABLE_SECRET_KEY"


def _env_file_path() -> Path:
    return Path(__file__).resolve().parents[1] / ".env"


def _read_key_from_env_file() -> str | None:
    env_path = _env_file_path()
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == _KEY_ENV_NAME:
            return value.strip()
    return None


def _persist_key_to_env_file(key: str) -> None:
    env_path = _env_file_path()
    if env_path.exists():
        existing = env_path.read_text(encoding="utf-8")
        if f"{_KEY_ENV_NAME}=" in existing:
            return
        prefix = "" if existing.endswith("\n") or existing == "" else "\n"
        env_path.write_text(f"{existing}{prefix}{_KEY_ENV_NAME}={key}\n", encoding="utf-8")
        return
    env_path.write_text(f"{_KEY_ENV_NAME}={key}\n", encoding="utf-8")


def _resolve_secret_key() -> str:
    from_env = (os.getenv(_KEY_ENV_NAME) or "").strip()
    if from_env:
        return from_env
    from_file = (_read_key_from_env_file() or "").strip()
    if from_file:
        os.environ[_KEY_ENV_NAME] = from_file
        return from_file
    generated = Fernet.generate_key().decode("utf-8")
    _persist_key_to_env_file(generated)
    os.environ[_KEY_ENV_NAME] = generated
    return generated


def _get_fernet() -> Fernet:
    global _FERNET
    if _FERNET is not None:
        return _FERNET
    key = _resolve_secret_key().encode("utf-8")
    _FERNET = Fernet(key)
    return _FERNET


def encrypt_secret(plain: str) -> str:
    if not plain.strip():
        raise HTTPException(status_code=400, detail="密钥内容不能为空")
    encrypted = _get_fernet().encrypt(plain.encode("utf-8"))
    return encrypted.decode("utf-8")


def decrypt_secret(encrypted: str) -> str:
    try:
        value = _get_fernet().decrypt(encrypted.encode("utf-8"))
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="凭据解密失败，请检查 AUTOTABLE_SECRET_KEY") from exc
    return value.decode("utf-8")

