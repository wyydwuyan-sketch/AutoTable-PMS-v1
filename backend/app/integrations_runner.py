from __future__ import annotations

import base64
import re
from datetime import datetime, timedelta
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.orm import Session, joinedload

from .integrations_crypto import decrypt_secret
from .models import ApiConnectorModel, ExecutionLogModel, FieldModel, RecordModel, TablePermissionModel
from .schemas import ConnectorRunResultOut
from .services import now_utc_naive, upsert_record_values
from .tenant_helpers import _next_id


_VARIABLE_PATTERN = re.compile(r"\{([a-zA-Z_]+)\}")


def _build_template_context(now: datetime | None = None) -> dict[str, str]:
    current = now or now_utc_naive()
    today = current.date()
    yesterday = today - timedelta(days=1)
    iso_year, iso_week, _ = today.isocalendar()
    return {
        "today": today.isoformat(),
        "yesterday": yesterday.isoformat(),
        "year": f"{today.year}",
        "month": f"{today.month:02d}",
        "week": f"{iso_year}-W{iso_week:02d}",
        "day": f"{today.day:02d}",
        "date": today.isoformat(),
        "datetime": current.strftime("%Y-%m-%d %H:%M:%S"),
    }


def _render_template(value: Any, context: dict[str, str]) -> Any:
    if isinstance(value, str):
        return _VARIABLE_PATTERN.sub(lambda match: context.get(match.group(1), match.group(0)), value)
    if isinstance(value, list):
        return [_render_template(item, context) for item in value]
    if isinstance(value, dict):
        return {str(key): _render_template(item, context) for key, item in value.items()}
    return value


def _get_by_path(payload: Any, path: str) -> tuple[bool, Any]:
    current = payload
    for segment in [item for item in path.split(".") if item]:
        if isinstance(current, dict):
            if segment not in current:
                return False, None
            current = current[segment]
            continue
        if isinstance(current, list) and segment.isdigit():
            index = int(segment)
            if index < 0 or index >= len(current):
                return False, None
            current = current[index]
            continue
        return False, None
    return True, current


def _extract_rows(payload: Any, response_path: str | None) -> list[dict[str, Any]]:
    data = payload
    if response_path:
        found, extracted = _get_by_path(payload, response_path)
        if not found:
            return []
        data = extracted

    if isinstance(data, list):
        rows: list[dict[str, Any]] = []
        for item in data:
            if isinstance(item, dict):
                rows.append(item)
        return rows
    if isinstance(data, dict):
        if isinstance(data.get("items"), list):
            return [item for item in data["items"] if isinstance(item, dict)]
        return [data]
    return []


def _transform_value(value: Any, transform: str | None) -> Any:
    if not transform:
        return value
    normalized = transform.strip()
    if not normalized:
        return value
    lowered = normalized.lower()
    if lowered == "upper" and isinstance(value, str):
        return value.upper()
    if lowered == "lower" and isinstance(value, str):
        return value.lower()
    if lowered.startswith("date:") and isinstance(value, str):
        format_token = normalized.split(":", 1)[1].strip()
        if not format_token:
            return value
        try:
            parsed = (
                datetime.fromisoformat(value.replace("Z", "+00:00"))
                if "T" in value
                else datetime.fromisoformat(f"{value}T00:00:00")
            )
        except ValueError:
            return value
        py_format = (
            format_token.replace("YYYY", "%Y")
            .replace("MM", "%m")
            .replace("DD", "%d")
            .replace("HH", "%H")
            .replace("mm", "%M")
            .replace("ss", "%S")
        )
        return parsed.strftime(py_format)
    return value


def _get_table_reference_member_ids(db: Session, tenant_id: str, table_id: str) -> set[str]:
    permissions = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    return {item.user_id for item in permissions if item.can_read or item.can_write}


def _build_auth_headers(auth_type: str, encrypted_secret: str | None) -> dict[str, str]:
    if auth_type == "none" or not encrypted_secret:
        return {}
    secret = decrypt_secret(encrypted_secret)
    if auth_type == "bearer":
        return {"Authorization": f"Bearer {secret}"}
    if auth_type == "basic":
        encoded = base64.b64encode(secret.encode("utf-8")).decode("utf-8")
        return {"Authorization": f"Basic {encoded}"}
    if auth_type == "api_key":
        if ":" in secret:
            key_name, key_value = secret.split(":", 1)
            if key_name.strip() and key_value.strip():
                return {key_name.strip(): key_value.strip()}
        return {"X-API-Key": secret}
    return {}


def _finalize_log(
    db: Session,
    log: ExecutionLogModel,
    *,
    status: str,
    rows_written: int,
    raw_log: str,
    error_msg: str | None = None,
) -> None:
    log.status = status
    log.rows_written = rows_written
    log.error_msg = error_msg
    log.raw_log = raw_log
    log.finished_at = now_utc_naive()
    db.commit()


def run_connector(connector_id: str, db: Session, *, trigger_source: str = "manual") -> ConnectorRunResultOut:
    connector = db.scalar(
        select(ApiConnectorModel)
        .where(ApiConnectorModel.id == connector_id)
        .options(
            joinedload(ApiConnectorModel.field_mappings),
            joinedload(ApiConnectorModel.schedule),
            joinedload(ApiConnectorModel.credential),
        )
    )
    if not connector:
        raise HTTPException(status_code=404, detail="接口不存在")

    started_at = now_utc_naive()
    log = ExecutionLogModel(
        id=_next_id("log"),
        connector_id=connector.id,
        started_at=started_at,
        status="running",
        rows_written=0,
        raw_log=f"[INFO] trigger={trigger_source}\n[INFO] connector={connector.name}",
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    context = _build_template_context(started_at)
    request_url = _render_template(connector.url, context)
    request_params = _render_template(connector.request_params_json or {}, context)
    request_headers = _render_template(connector.request_headers_json or {}, context)
    auth_headers = _build_auth_headers(connector.auth_type, connector.credential.secret_encrypted if connector.credential else None)
    merged_headers = {str(k): str(v) for k, v in {**request_headers, **auth_headers}.items()}

    fields = db.scalars(
        select(FieldModel).where(
            FieldModel.tenant_id == connector.tenant_id,
            FieldModel.table_id == connector.table_id,
        )
    ).all()
    fields_by_id = {item.id: item for item in fields}
    allowed_member_ids = _get_table_reference_member_ids(db, connector.tenant_id, connector.table_id)

    lines = [
        f"[INFO] method={connector.method}",
        f"[INFO] url={request_url}",
        f"[INFO] response_path={connector.response_path or '<root>'}",
    ]

    try:
        with httpx.Client(timeout=20.0, trust_env=False) as client:
            if connector.method.upper() == "GET":
                response = client.get(str(request_url), params=request_params, headers=merged_headers)
            elif connector.method.upper() == "POST":
                response = client.post(str(request_url), json=request_params, headers=merged_headers)
            else:
                raise HTTPException(status_code=400, detail=f"不支持的请求方法: {connector.method}")
        lines.append(f"[INFO] http_status={response.status_code}")
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="接口响应不是合法 JSON") from exc
        rows = _extract_rows(payload, connector.response_path)
        lines.append(f"[INFO] extracted_rows={len(rows)}")

        rows_written = 0
        for source_row in rows:
            patch: dict[str, Any] = {}
            for mapping in connector.field_mappings:
                found, raw_value = _get_by_path(source_row, mapping.source_key)
                if not found:
                    continue
                patch[mapping.target_field_id] = _transform_value(raw_value, mapping.transform)
            if not patch:
                continue
            record = RecordModel(
                id=_next_id("rec"),
                tenant_id=connector.tenant_id,
                table_id=connector.table_id,
                created_at=now_utc_naive(),
                updated_at=now_utc_naive(),
                version=0,
            )
            db.add(record)
            upsert_record_values(db, record, fields_by_id, patch, allowed_member_ids)
            rows_written += 1

        connector.updated_at = now_utc_naive()
        lines.append(f"[SUCCESS] rows_written={rows_written}")
        _finalize_log(
            db,
            log,
            status="success",
            rows_written=rows_written,
            raw_log="\n".join(lines),
        )
        return ConnectorRunResultOut(status="success", rowsWritten=rows_written, errorMsg=None)
    except Exception as exc:
        db.rollback()
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        lines.append(f"[ERROR] {detail}")
        _finalize_log(
            db,
            log,
            status="failed",
            rows_written=0,
            raw_log="\n".join(lines),
            error_msg=detail,
        )
        return ConnectorRunResultOut(status="failed", rowsWritten=0, errorMsg=detail)
