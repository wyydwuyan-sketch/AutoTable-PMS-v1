from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..access_helpers import _ensure_table_exists
from ..auth import get_current_tenant, get_current_user
from ..db import get_db
from ..integrations_crypto import decrypt_secret, encrypt_secret
from ..integrations_runner import run_connector
from ..integrations_scheduler import remove_connector_job, upsert_connector_job
from ..models import (
    ApiConnectorModel,
    ConnectorScheduleModel,
    CredentialModel,
    ExecutionLogModel,
    FieldMappingModel,
    FieldModel,
    MembershipModel,
    TenantModel,
    UserModel,
)
from ..schemas import (
    ApiConnectorCreateIn,
    ApiConnectorOut,
    ApiConnectorPatchIn,
    ConnectorRunResultOut,
    ConnectorScheduleIn,
    ConnectorScheduleOut,
    CredentialCreateIn,
    CredentialOut,
    ExecutionLogOut,
    FieldMappingOut,
    IntegrationStatsOut,
)
from ..services import now_utc_naive
from ..tenant_helpers import _next_id

router = APIRouter()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _mask_secret(secret: str) -> str:
    trimmed = secret.strip()
    if len(trimmed) <= 4:
        return "****"
    return f"{'*' * (len(trimmed) - 4)}{trimmed[-4:]}"


def _masked_credential_secret(item: CredentialModel) -> str:
    try:
        return _mask_secret(decrypt_secret(item.secret_encrypted))
    except Exception:
        return "****"


def _ensure_manage_integrations_allowed(db: Session, user_id: str, tenant_id: str) -> None:
    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == user_id,
            MembershipModel.tenant_id == tenant_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=403, detail="当前租户无权限")
    if membership.role == "owner" or membership.role_key == "admin":
        return
    raise HTTPException(status_code=403, detail="仅 owner/admin 可管理接口配置")


def _ensure_connector_exists(
    db: Session,
    connector_id: str,
    tenant_id: str,
) -> ApiConnectorModel:
    connector = db.scalar(
        select(ApiConnectorModel)
        .where(
            ApiConnectorModel.id == connector_id,
            ApiConnectorModel.tenant_id == tenant_id,
        )
        .options(
            joinedload(ApiConnectorModel.table),
            joinedload(ApiConnectorModel.schedule),
            joinedload(ApiConnectorModel.field_mappings).joinedload(FieldMappingModel.target_field),
            joinedload(ApiConnectorModel.credential),
        )
    )
    if connector:
        return connector
    raise HTTPException(status_code=404, detail="接口不存在")


def _ensure_credential_exists(
    db: Session,
    credential_id: str,
    tenant_id: str,
) -> CredentialModel:
    credential = db.scalar(
        select(CredentialModel).where(
            CredentialModel.id == credential_id,
            CredentialModel.tenant_id == tenant_id,
        )
    )
    if credential:
        return credential
    raise HTTPException(status_code=404, detail="凭据不存在")


def _serialize_schedule(schedule: ConnectorScheduleModel | None) -> ConnectorScheduleOut:
    if not schedule:
        return ConnectorScheduleOut(cronExpr="0 8 * * *", isEnabled=False, nextRunAt=None)
    return ConnectorScheduleOut(
        cronExpr=schedule.cron_expr,
        isEnabled=schedule.is_enabled,
        nextRunAt=_iso(schedule.next_run_at),
    )


def _collect_run_stats(db: Session, connector_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not connector_ids:
        return {}
    rows = db.execute(
        select(
            ExecutionLogModel.connector_id,
            ExecutionLogModel.status,
            ExecutionLogModel.started_at,
        )
        .where(ExecutionLogModel.connector_id.in_(connector_ids))
        .order_by(ExecutionLogModel.started_at.desc())
    ).all()
    stats: dict[str, dict[str, Any]] = {}
    for connector_id, status, started_at in rows:
        item = stats.setdefault(
            connector_id,
            {"totalRuns": 0, "successRuns": 0, "lastRunAt": None, "lastStatus": None},
        )
        item["totalRuns"] += 1
        if status == "success":
            item["successRuns"] += 1
        if item["lastRunAt"] is None:
            item["lastRunAt"] = started_at
            if status in {"running", "success", "failed"}:
                item["lastStatus"] = status
    return stats


def _serialize_field_mapping(mapping: FieldMappingModel) -> FieldMappingOut:
    target_name = mapping.target_field.name if mapping.target_field else mapping.target_field_id
    return FieldMappingOut(
        id=mapping.id,
        sourceKey=mapping.source_key,
        targetFieldId=mapping.target_field_id,
        targetFieldLabel=target_name,
        transform=mapping.transform,
    )


def _serialize_connector(
    connector: ApiConnectorModel,
    *,
    run_stat: dict[str, Any] | None = None,
) -> ApiConnectorOut:
    stat = run_stat or {}
    method = connector.method.upper()
    return ApiConnectorOut(
        id=connector.id,
        name=connector.name,
        description=connector.description,
        tableId=connector.table_id,
        tableName=connector.table.name if connector.table else connector.table_id,
        mode=connector.mode,  # type: ignore[arg-type]
        method=method,  # type: ignore[arg-type]
        url=connector.url,
        authType=connector.auth_type,  # type: ignore[arg-type]
        credentialId=connector.credential_id,
        requestParams=connector.request_params_json or {},
        requestHeaders=connector.request_headers_json or {},
        responsePath=connector.response_path,
        isEnabled=connector.is_enabled,
        createdAt=connector.created_at.isoformat(),
        updatedAt=connector.updated_at.isoformat(),
        lastRunAt=_iso(stat.get("lastRunAt")),
        lastStatus=stat.get("lastStatus"),
        totalRuns=int(stat.get("totalRuns", 0)),
        successRuns=int(stat.get("successRuns", 0)),
        fieldMappings=[_serialize_field_mapping(item) for item in connector.field_mappings],
        schedule=_serialize_schedule(connector.schedule),
    )


def _resolve_target_fields(
    db: Session,
    *,
    tenant_id: str,
    table_id: str,
    target_field_ids: list[str],
) -> dict[str, FieldModel]:
    if not target_field_ids:
        return {}
    fields = db.scalars(
        select(FieldModel).where(
            FieldModel.tenant_id == tenant_id,
            FieldModel.table_id == table_id,
            FieldModel.id.in_(target_field_ids),
        )
    ).all()
    fields_by_id = {item.id: item for item in fields}
    missing = [field_id for field_id in target_field_ids if field_id not in fields_by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"目标字段不存在或不属于目标表: {missing[0]}")
    return fields_by_id


def _sync_job_for_connector(
    connector: ApiConnectorModel,
    schedule: ConnectorScheduleModel | None,
) -> None:
    if not schedule:
        return
    if connector.is_enabled and schedule.is_enabled:
        try:
            next_run = upsert_connector_job(connector.id, schedule.cron_expr)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        schedule.next_run_at = next_run.replace(tzinfo=None) if next_run else None
        return
    remove_connector_job(connector.id)
    schedule.next_run_at = None


@router.get("/integrations/credentials", response_model=list[CredentialOut])
def list_credentials(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[CredentialOut]:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    credentials = db.scalars(
        select(CredentialModel)
        .where(CredentialModel.tenant_id == tenant.id)
        .order_by(CredentialModel.created_at.desc())
    ).all()
    return [
        CredentialOut(
            id=item.id,
            name=item.name,
            authType=item.auth_type,  # type: ignore[arg-type]
            maskedSecret=_masked_credential_secret(item),
            createdAt=item.created_at.isoformat(),
        )
        for item in credentials
    ]


@router.post("/integrations/credentials", response_model=CredentialOut)
def create_credential(
    payload: CredentialCreateIn,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> CredentialOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    encrypted = encrypt_secret(payload.secret)
    created = CredentialModel(
        id=_next_id("cred"),
        tenant_id=tenant.id,
        name=payload.name.strip(),
        auth_type=payload.authType,
        secret_encrypted=encrypted,
        created_at=now_utc_naive(),
    )
    db.add(created)
    db.commit()
    return CredentialOut(
        id=created.id,
        name=created.name,
        authType=created.auth_type,  # type: ignore[arg-type]
        maskedSecret=_masked_credential_secret(created),
        createdAt=created.created_at.isoformat(),
    )


@router.delete("/integrations/credentials/{credential_id}", status_code=204, response_class=Response)
def delete_credential(
    credential_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Response:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    credential = _ensure_credential_exists(db, credential_id, tenant.id)
    connectors = db.scalars(
        select(ApiConnectorModel).where(
            ApiConnectorModel.tenant_id == tenant.id,
            ApiConnectorModel.credential_id == credential.id,
        )
    ).all()
    for connector in connectors:
        connector.credential_id = None
        connector.auth_type = "none"
        connector.updated_at = now_utc_naive()
    db.delete(credential)
    db.commit()
    return Response(status_code=204)


@router.get("/integrations/connectors", response_model=list[ApiConnectorOut])
def list_connectors(
    search: str | None = Query(default=None),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[ApiConnectorOut]:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    stmt = (
        select(ApiConnectorModel)
        .where(ApiConnectorModel.tenant_id == tenant.id)
        .options(
            joinedload(ApiConnectorModel.table),
            joinedload(ApiConnectorModel.schedule),
            joinedload(ApiConnectorModel.field_mappings).joinedload(FieldMappingModel.target_field),
        )
        .order_by(ApiConnectorModel.updated_at.desc())
    )
    connectors = db.scalars(stmt).unique().all()
    if search and search.strip():
        keyword = search.strip().lower()
        connectors = [
            item
            for item in connectors
            if keyword in item.name.lower()
            or keyword in item.url.lower()
            or (item.description or "").lower().find(keyword) >= 0
        ]
    stats = _collect_run_stats(db, [item.id for item in connectors])
    return [_serialize_connector(item, run_stat=stats.get(item.id)) for item in connectors]


@router.post("/integrations/connectors", response_model=ApiConnectorOut)
def create_connector(
    payload: ApiConnectorCreateIn,
    request: Request,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ApiConnectorOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    table = _ensure_table_exists(db, payload.tableId, tenant.id, request, user.id)
    if payload.authType != "none" and not payload.credentialId:
        raise HTTPException(status_code=400, detail="认证方式非 none 时必须选择凭据")
    if payload.credentialId:
        _ensure_credential_exists(db, payload.credentialId, tenant.id)

    target_fields = _resolve_target_fields(
        db,
        tenant_id=tenant.id,
        table_id=table.id,
        target_field_ids=[item.targetFieldId for item in payload.fieldMappings],
    )

    connector = ApiConnectorModel(
        id=_next_id("conn"),
        tenant_id=tenant.id,
        table_id=table.id,
        name=payload.name.strip(),
        description=payload.description,
        mode=payload.mode,
        method=payload.method,
        url=payload.url.strip(),
        auth_type=payload.authType,
        credential_id=payload.credentialId if payload.authType != "none" else None,
        request_params_json=payload.requestParams or {},
        request_headers_json=payload.requestHeaders or {},
        response_path=payload.responsePath,
        is_enabled=payload.isEnabled,
        created_at=now_utc_naive(),
        updated_at=now_utc_naive(),
    )
    db.add(connector)
    db.flush()

    for item in payload.fieldMappings:
        target_field = target_fields[item.targetFieldId]
        db.add(
            FieldMappingModel(
                id=_next_id("fmap"),
                connector_id=connector.id,
                source_key=item.sourceKey.strip(),
                target_field_id=target_field.id,
                transform=item.transform,
            )
        )

    schedule = ConnectorScheduleModel(
        id=_next_id("sch"),
        connector_id=connector.id,
        cron_expr=payload.schedule.cronExpr.strip(),
        is_enabled=payload.schedule.isEnabled,
        next_run_at=None,
    )
    db.add(schedule)
    _sync_job_for_connector(connector, schedule)
    db.commit()
    db.refresh(connector)
    connector = _ensure_connector_exists(db, connector.id, tenant.id)
    return _serialize_connector(connector, run_stat={"totalRuns": 0, "successRuns": 0})


@router.get("/integrations/connectors/{connector_id}", response_model=ApiConnectorOut)
def get_connector(
    connector_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ApiConnectorOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    connector = _ensure_connector_exists(db, connector_id, tenant.id)
    stats = _collect_run_stats(db, [connector.id])
    return _serialize_connector(connector, run_stat=stats.get(connector.id))


@router.patch("/integrations/connectors/{connector_id}", response_model=ApiConnectorOut)
def patch_connector(
    connector_id: str,
    payload: ApiConnectorPatchIn,
    request: Request,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ApiConnectorOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    connector = _ensure_connector_exists(db, connector_id, tenant.id)

    next_table_id = payload.tableId or connector.table_id
    if payload.tableId:
        _ensure_table_exists(db, payload.tableId, tenant.id, request, user.id)
    if payload.authType is not None and payload.authType != "none":
        if payload.credentialId is None and connector.credential_id is None:
            raise HTTPException(status_code=400, detail="认证方式非 none 时必须提供凭据")
    if payload.credentialId:
        _ensure_credential_exists(db, payload.credentialId, tenant.id)
    if payload.tableId and payload.fieldMappings is None:
        raise HTTPException(status_code=400, detail="变更目标表时必须同时提交 fieldMappings")

    if payload.name is not None:
        connector.name = payload.name.strip()
    if payload.description is not None:
        connector.description = payload.description
    if payload.tableId is not None:
        connector.table_id = payload.tableId
    if payload.mode is not None:
        connector.mode = payload.mode
    if payload.method is not None:
        connector.method = payload.method
    if payload.url is not None:
        connector.url = payload.url.strip()
    if payload.authType is not None:
        connector.auth_type = payload.authType
        if payload.authType == "none":
            connector.credential_id = None
    if payload.credentialId is not None:
        connector.credential_id = payload.credentialId
    if payload.requestParams is not None:
        connector.request_params_json = payload.requestParams
    if payload.requestHeaders is not None:
        connector.request_headers_json = payload.requestHeaders
    if payload.responsePath is not None:
        connector.response_path = payload.responsePath
    if payload.isEnabled is not None:
        connector.is_enabled = payload.isEnabled
    connector.updated_at = now_utc_naive()

    if payload.fieldMappings is not None:
        target_fields = _resolve_target_fields(
            db,
            tenant_id=tenant.id,
            table_id=next_table_id,
            target_field_ids=[item.targetFieldId for item in payload.fieldMappings],
        )
        connector.field_mappings.clear()
        db.flush()
        for item in payload.fieldMappings:
            target_field = target_fields[item.targetFieldId]
            db.add(
                FieldMappingModel(
                    id=_next_id("fmap"),
                    connector_id=connector.id,
                    source_key=item.sourceKey.strip(),
                    target_field_id=target_field.id,
                    transform=item.transform,
                )
            )

    _sync_job_for_connector(connector, connector.schedule)
    db.commit()
    db.refresh(connector)
    connector = _ensure_connector_exists(db, connector.id, tenant.id)
    stats = _collect_run_stats(db, [connector.id])
    return _serialize_connector(connector, run_stat=stats.get(connector.id))


@router.delete("/integrations/connectors/{connector_id}", status_code=204, response_class=Response)
def delete_connector(
    connector_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Response:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    connector = _ensure_connector_exists(db, connector_id, tenant.id)
    remove_connector_job(connector.id)
    db.delete(connector)
    db.commit()
    return Response(status_code=204)


@router.post("/integrations/connectors/{connector_id}/run", response_model=ConnectorRunResultOut)
def run_connector_now(
    connector_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ConnectorRunResultOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    _ensure_connector_exists(db, connector_id, tenant.id)
    return run_connector(connector_id, db, trigger_source="manual")


@router.get("/integrations/connectors/{connector_id}/schedule", response_model=ConnectorScheduleOut)
def get_connector_schedule(
    connector_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ConnectorScheduleOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    connector = _ensure_connector_exists(db, connector_id, tenant.id)
    return _serialize_schedule(connector.schedule)


@router.put("/integrations/connectors/{connector_id}/schedule", response_model=ConnectorScheduleOut)
def put_connector_schedule(
    connector_id: str,
    payload: ConnectorScheduleIn,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ConnectorScheduleOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    connector = _ensure_connector_exists(db, connector_id, tenant.id)
    schedule = connector.schedule
    if not schedule:
        schedule = ConnectorScheduleModel(
            id=_next_id("sch"),
            connector_id=connector.id,
            cron_expr=payload.cronExpr.strip(),
            is_enabled=payload.isEnabled,
            next_run_at=None,
        )
        db.add(schedule)
        connector.schedule = schedule
    else:
        schedule.cron_expr = payload.cronExpr.strip()
        schedule.is_enabled = payload.isEnabled
    connector.updated_at = now_utc_naive()
    _sync_job_for_connector(connector, schedule)
    db.commit()
    return _serialize_schedule(schedule)


@router.get("/integrations/logs", response_model=list[ExecutionLogOut])
def list_execution_logs(
    connectorId: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[ExecutionLogOut]:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    stmt = (
        select(ExecutionLogModel)
        .join(ApiConnectorModel, ApiConnectorModel.id == ExecutionLogModel.connector_id)
        .where(ApiConnectorModel.tenant_id == tenant.id)
        .options(joinedload(ExecutionLogModel.connector))
        .order_by(ExecutionLogModel.started_at.desc())
        .limit(limit)
    )
    if connectorId:
        stmt = stmt.where(ExecutionLogModel.connector_id == connectorId)
    logs = db.scalars(stmt).unique().all()
    return [
        ExecutionLogOut(
            id=item.id,
            connectorId=item.connector_id,
            connectorName=item.connector.name if item.connector else item.connector_id,
            startedAt=item.started_at.isoformat(),
            finishedAt=_iso(item.finished_at),
            status=item.status,  # type: ignore[arg-type]
            rowsWritten=item.rows_written,
            errorMsg=item.error_msg,
            rawLog=item.raw_log,
        )
        for item in logs
    ]


@router.get("/integrations/logs/{log_id}", response_model=ExecutionLogOut)
def get_execution_log(
    log_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> ExecutionLogOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    log = db.scalar(
        select(ExecutionLogModel)
        .join(ApiConnectorModel, ApiConnectorModel.id == ExecutionLogModel.connector_id)
        .where(
            ExecutionLogModel.id == log_id,
            ApiConnectorModel.tenant_id == tenant.id,
        )
        .options(joinedload(ExecutionLogModel.connector))
    )
    if not log:
        raise HTTPException(status_code=404, detail="日志不存在")
    return ExecutionLogOut(
        id=log.id,
        connectorId=log.connector_id,
        connectorName=log.connector.name if log.connector else log.connector_id,
        startedAt=log.started_at.isoformat(),
        finishedAt=_iso(log.finished_at),
        status=log.status,  # type: ignore[arg-type]
        rowsWritten=log.rows_written,
        errorMsg=log.error_msg,
        rawLog=log.raw_log,
    )


@router.get("/integrations/stats", response_model=IntegrationStatsOut)
def get_integration_stats(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> IntegrationStatsOut:
    _ensure_manage_integrations_allowed(db, user.id, tenant.id)
    total_connectors = db.scalar(
        select(func.count()).select_from(ApiConnectorModel).where(ApiConnectorModel.tenant_id == tenant.id)
    ) or 0
    enabled_connectors = db.scalar(
        select(func.count())
        .select_from(ApiConnectorModel)
        .where(ApiConnectorModel.tenant_id == tenant.id, ApiConnectorModel.is_enabled.is_(True))
    ) or 0
    logs = db.execute(
        select(ExecutionLogModel.status, ExecutionLogModel.started_at)
        .join(ApiConnectorModel, ApiConnectorModel.id == ExecutionLogModel.connector_id)
        .where(ApiConnectorModel.tenant_id == tenant.id)
    ).all()
    today = now_utc_naive().date()
    runs_today = sum(1 for _, started_at in logs if started_at.date() == today)
    completed = [status for status, _ in logs if status in {"success", "failed"}]
    success_count = sum(1 for status in completed if status == "success")
    success_rate = int(round((success_count / len(completed)) * 100)) if completed else 0
    failure_count = sum(1 for status, _ in logs if status == "failed")
    running_count = sum(1 for status, _ in logs if status == "running")
    return IntegrationStatsOut(
        totalConnectors=int(total_connectors),
        enabledConnectors=int(enabled_connectors),
        runsToday=runs_today,
        successRate=success_rate,
        failureCount=failure_count,
        runningCount=running_count,
    )
