from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..access_helpers import _ensure_table_access, _ensure_view_exists
from ..auth import get_current_tenant, get_current_user, write_audit_log
from ..db import get_db
from ..models import (
    FieldModel,
    RecordModel,
    RecordStatusLogModel,
    TableWorkflowConfigModel,
    TenantModel,
    TenantRoleModel,
    UserModel,
    ViewModel,
    ViewPermissionModel,
    ViewTabModel,
    WorkflowTransitionModel,
)
from ..schemas import (
    FieldOptionOut,
    KanbanCardOut,
    KanbanColumnsOut,
    KanbanColumnOut,
    KanbanMoveIn,
    RecordStatusLogOut,
    StatusTransitionIn,
    StatusTransitionOut,
    ViewTabCreateIn,
    ViewTabOut,
    ViewTabPatchIn,
    ViewTabPayload,
    WorkflowConfigOut,
    WorkflowConfigPatchIn,
    WorkflowTransitionPairOut,
    WorkflowTransitionPatchIn,
)
from ..services import (
    apply_filters_and_sorts,
    now_utc_naive,
    serialize_record,
    upsert_record_values,
)
from ..tenant_helpers import _get_membership, _get_membership_role, _next_id

router = APIRouter()


@router.get("/tables/{table_id}/workflow", response_model=WorkflowConfigOut)
def get_table_workflow(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> WorkflowConfigOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    config = _get_or_create_workflow_config(db, tenant.id, table_id)
    status_field = _load_status_field(db, tenant.id, table_id, config.status_field_id)
    options = _field_options(status_field)
    return WorkflowConfigOut(
        tableId=table_id,
        statusFieldId=status_field.id if status_field else None,
        allowAnyTransition=bool(config.allow_any_transition),
        finalStatusOptionIds=list(config.final_status_option_ids_json or []),
        statusOptions=options,
    )


@router.put("/tables/{table_id}/workflow", response_model=WorkflowConfigOut)
def upsert_table_workflow(
    table_id: str,
    payload: WorkflowConfigPatchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> WorkflowConfigOut:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_workflow_manage_allowed(db, user.id, tenant.id)

    config = _get_or_create_workflow_config(db, tenant.id, table_id)
    status_field: FieldModel | None = None
    if payload.statusFieldId:
        status_field = db.scalar(
            select(FieldModel).where(
                FieldModel.id == payload.statusFieldId,
                FieldModel.table_id == table_id,
                FieldModel.tenant_id == tenant.id,
            )
        )
        if not status_field:
            raise HTTPException(status_code=404, detail="状态字段不存在")
        if status_field.type != "singleSelect":
            raise HTTPException(status_code=400, detail="状态字段必须是单选字段")
        config.status_field_id = status_field.id
    elif payload.statusFieldId is None:
        config.status_field_id = None

    if config.status_field_id:
        status_field = _load_status_field(db, tenant.id, table_id, config.status_field_id)
    options = _field_options(status_field)
    option_ids = {item.id for item in options}
    invalid_final_options = [item for item in payload.finalStatusOptionIds if item not in option_ids]
    if invalid_final_options:
        raise HTTPException(status_code=400, detail=f"终态选项不存在: {', '.join(invalid_final_options)}")

    config.allow_any_transition = payload.allowAnyTransition
    config.final_status_option_ids_json = list(dict.fromkeys(payload.finalStatusOptionIds))
    config.updated_at = now_utc_naive()

    if payload.allowAnyTransition:
        db.query(WorkflowTransitionModel).filter(
            WorkflowTransitionModel.tenant_id == tenant.id,
            WorkflowTransitionModel.table_id == table_id,
        ).delete(synchronize_session=False)

    db.commit()
    db.refresh(config)
    write_audit_log(
        db,
        action="update_workflow_config",
        result="success",
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table_id,
    )
    return WorkflowConfigOut(
        tableId=table_id,
        statusFieldId=config.status_field_id,
        allowAnyTransition=bool(config.allow_any_transition),
        finalStatusOptionIds=list(config.final_status_option_ids_json or []),
        statusOptions=options,
    )


@router.get("/tables/{table_id}/workflow/transitions", response_model=list[WorkflowTransitionPairOut])
def get_workflow_transitions(
    table_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[WorkflowTransitionPairOut]:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    transitions = db.scalars(
        select(WorkflowTransitionModel).where(
            WorkflowTransitionModel.tenant_id == tenant.id,
            WorkflowTransitionModel.table_id == table_id,
        )
    ).all()
    rows = sorted(transitions, key=lambda item: (item.from_option_id, item.to_option_id))
    return [WorkflowTransitionPairOut(fromOptionId=item.from_option_id, toOptionId=item.to_option_id) for item in rows]


@router.put("/tables/{table_id}/workflow/transitions", response_model=list[WorkflowTransitionPairOut])
def put_workflow_transitions(
    table_id: str,
    payload: WorkflowTransitionPatchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[WorkflowTransitionPairOut]:
    _ensure_table_access(
        db,
        table_id=table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    _ensure_workflow_manage_allowed(db, user.id, tenant.id)

    config = _get_or_create_workflow_config(db, tenant.id, table_id)
    if not config.status_field_id:
        raise HTTPException(status_code=400, detail="请先配置状态字段")
    status_field = _load_status_field(db, tenant.id, table_id, config.status_field_id)
    options = _field_options(status_field)
    option_ids = {item.id for item in options}

    pairs: set[tuple[str, str]] = set()
    for row in payload.transitions:
        if row.fromOptionId not in option_ids:
            raise HTTPException(status_code=400, detail=f"非法 fromOptionId: {row.fromOptionId}")
        for target in row.toOptionIds:
            if target not in option_ids:
                raise HTTPException(status_code=400, detail=f"非法 toOptionId: {target}")
            pairs.add((row.fromOptionId, target))

    db.query(WorkflowTransitionModel).filter(
        WorkflowTransitionModel.tenant_id == tenant.id,
        WorkflowTransitionModel.table_id == table_id,
    ).delete(synchronize_session=False)
    for from_option_id, to_option_id in sorted(pairs):
        db.add(
            WorkflowTransitionModel(
                tenant_id=tenant.id,
                table_id=table_id,
                from_option_id=from_option_id,
                to_option_id=to_option_id,
                created_at=now_utc_naive(),
            )
        )

    config.allow_any_transition = False
    config.updated_at = now_utc_naive()
    db.commit()
    write_audit_log(
        db,
        action="update_workflow_transitions",
        result="success",
        request=request,
        user_id=user.id,
        tenant_id=tenant.id,
        resource_type="table",
        resource_id=table_id,
    )
    return [WorkflowTransitionPairOut(fromOptionId=left, toOptionId=right) for left, right in sorted(pairs)]


@router.post("/records/{record_id}/status-transition", response_model=StatusTransitionOut)
def transition_record_status(
    record_id: str,
    payload: StatusTransitionIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> StatusTransitionOut:
    record = _ensure_record_with_values(db, tenant.id, record_id)
    _ensure_table_access(
        db,
        table_id=record.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="write",
    )
    status_field = _resolve_status_field_for_table(db, tenant.id, record.table_id)
    if not status_field:
        raise HTTPException(status_code=400, detail="当前表未配置状态字段")
    option_ids = {item.id for item in _field_options(status_field)}
    if payload.toStatusOptionId not in option_ids:
        raise HTTPException(status_code=400, detail="目标状态不存在")
    if payload.expectedVersion is not None and int(record.version or 0) != payload.expectedVersion:
        raise HTTPException(status_code=409, detail="记录版本冲突，请刷新后重试")

    values_by_field_id = {item.field_id: item.value_json for item in record.values}
    from_status = values_by_field_id.get(status_field.id)
    from_option_id = str(from_status) if isinstance(from_status, str) else None
    to_option_id = payload.toStatusOptionId
    if from_option_id == to_option_id:
        return StatusTransitionOut(
            record=serialize_record(record),
            fromStatusOptionId=from_option_id,
            toStatusOptionId=to_option_id,
        )

    config = _get_or_create_workflow_config(db, tenant.id, record.table_id)
    transition_allowed = bool(config.allow_any_transition)
    if not transition_allowed and from_option_id is not None:
        exists = db.scalar(
            select(func.count())
            .select_from(WorkflowTransitionModel)
            .where(
                WorkflowTransitionModel.tenant_id == tenant.id,
                WorkflowTransitionModel.table_id == record.table_id,
                WorkflowTransitionModel.from_option_id == from_option_id,
                WorkflowTransitionModel.to_option_id == to_option_id,
            )
        ) or 0
        transition_allowed = int(exists) > 0
    if not transition_allowed:
        raise HTTPException(status_code=400, detail="该状态流转不被允许")

    fields = db.scalars(
        select(FieldModel).where(
            FieldModel.table_id == record.table_id,
            FieldModel.tenant_id == tenant.id,
        )
    ).all()
    fields_by_id = {field.id: field for field in fields}
    upsert_record_values(db, record, fields_by_id, {status_field.id: to_option_id}, allowed_member_ids=None)
    record.version = int(record.version or 0) + 1
    db.add(
        RecordStatusLogModel(
            tenant_id=tenant.id,
            table_id=record.table_id,
            record_id=record.id,
            status_field_id=status_field.id,
            from_option_id=from_option_id,
            to_option_id=to_option_id,
            operator_user_id=user.id,
            source=payload.source,
            created_at=now_utc_naive(),
        )
    )
    db.commit()
    db.refresh(record)
    return StatusTransitionOut(
        record=serialize_record(record),
        fromStatusOptionId=from_option_id,
        toStatusOptionId=to_option_id,
    )


@router.get("/records/{record_id}/status-logs", response_model=list[RecordStatusLogOut])
def get_record_status_logs(
    record_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[RecordStatusLogOut]:
    record = _ensure_record_with_values(db, tenant.id, record_id)
    _ensure_table_access(
        db,
        table_id=record.table_id,
        tenant_id=tenant.id,
        user_id=user.id,
        request=request,
        access="read",
    )
    logs = db.scalars(
        select(RecordStatusLogModel)
        .where(
            RecordStatusLogModel.tenant_id == tenant.id,
            RecordStatusLogModel.record_id == record_id,
        )
        .order_by(RecordStatusLogModel.created_at.desc(), RecordStatusLogModel.id.desc())
    ).all()
    operator_ids = sorted({item.operator_user_id for item in logs if item.operator_user_id})
    users = db.scalars(select(UserModel).where(UserModel.id.in_(operator_ids))).all() if operator_ids else []
    username_by_id = {item.id: item.username for item in users}
    return [
        RecordStatusLogOut(
            id=item.id,
            recordId=item.record_id,
            tableId=item.table_id,
            statusFieldId=item.status_field_id,
            fromOptionId=item.from_option_id,
            toOptionId=item.to_option_id,
            operatorUserId=item.operator_user_id,
            operatorUsername=username_by_id.get(item.operator_user_id or ""),
            source=item.source,
            createdAt=item.created_at.isoformat(),
        )
        for item in logs
    ]


@router.get("/views/{view_id}/tabs", response_model=list[ViewTabOut])
def get_view_tabs(
    view_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> list[ViewTabOut]:
    view = _ensure_view_access(db, view_id, tenant.id, user.id, request, access="read")
    custom_tabs = db.scalars(
        select(ViewTabModel)
        .where(
            ViewTabModel.tenant_id == tenant.id,
            ViewTabModel.view_id == view.id,
        )
        .order_by(ViewTabModel.sort_order.asc(), ViewTabModel.created_at.asc())
    ).all()
    visible_custom_tabs = [
        item
        for item in custom_tabs
        if item.visibility == "shared" or item.owner_user_id == user.id
    ]
    system_tabs = _build_system_tabs(db, tenant.id, view.table_id, view.id, user)
    custom_out = [
        ViewTabOut(
            id=item.id,
            viewId=item.view_id,
            tableId=item.table_id,
            name=item.name,
            visibility="shared" if item.visibility == "shared" else "personal",
            ownerUserId=item.owner_user_id,
            isSystemPreset=bool(item.is_system_preset),
            sortOrder=int(item.sort_order),
            payload=ViewTabPayload.model_validate(item.filter_payload_json or {}),
        )
        for item in visible_custom_tabs
    ]
    return [*system_tabs, *custom_out]


@router.post("/views/{view_id}/tabs", response_model=ViewTabOut)
def create_view_tab(
    view_id: str,
    payload: ViewTabCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewTabOut:
    view = _ensure_view_access(db, view_id, tenant.id, user.id, request, access="write")
    max_order = db.scalar(
        select(func.max(ViewTabModel.sort_order)).where(
            ViewTabModel.tenant_id == tenant.id,
            ViewTabModel.view_id == view.id,
        )
    )
    created = ViewTabModel(
        id=_next_id("vtab"),
        tenant_id=tenant.id,
        view_id=view.id,
        table_id=view.table_id,
        name=payload.name.strip() or "未命名标签",
        visibility=payload.visibility,
        owner_user_id=user.id,
        is_system_preset=False,
        filter_payload_json=payload.payload.model_dump(),
        sort_order=int(payload.sortOrder if payload.sortOrder is not None else (int(max_order or -1) + 1)),
        created_at=now_utc_naive(),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return ViewTabOut(
        id=created.id,
        viewId=created.view_id,
        tableId=created.table_id,
        name=created.name,
        visibility="shared" if created.visibility == "shared" else "personal",
        ownerUserId=created.owner_user_id,
        isSystemPreset=False,
        sortOrder=created.sort_order,
        payload=ViewTabPayload.model_validate(created.filter_payload_json or {}),
    )


@router.put("/views/{view_id}/tabs/{tab_id}", response_model=ViewTabOut)
def update_view_tab(
    view_id: str,
    tab_id: str,
    payload: ViewTabPatchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> ViewTabOut:
    view = _ensure_view_access(db, view_id, tenant.id, user.id, request, access="write")
    tab = db.scalar(
        select(ViewTabModel).where(
            ViewTabModel.id == tab_id,
            ViewTabModel.view_id == view.id,
            ViewTabModel.tenant_id == tenant.id,
        )
    )
    if not tab:
        raise HTTPException(status_code=404, detail="标签不存在")
    if tab.owner_user_id and tab.owner_user_id != user.id and tab.visibility != "shared":
        raise HTTPException(status_code=403, detail="仅标签创建者可修改个人标签")
    if payload.name is not None:
        tab.name = payload.name.strip() or tab.name
    if payload.visibility is not None:
        tab.visibility = payload.visibility
    if payload.payload is not None:
        tab.filter_payload_json = payload.payload.model_dump()
    if payload.sortOrder is not None:
        tab.sort_order = int(payload.sortOrder)
    db.commit()
    db.refresh(tab)
    return ViewTabOut(
        id=tab.id,
        viewId=tab.view_id,
        tableId=tab.table_id,
        name=tab.name,
        visibility="shared" if tab.visibility == "shared" else "personal",
        ownerUserId=tab.owner_user_id,
        isSystemPreset=False,
        sortOrder=tab.sort_order,
        payload=ViewTabPayload.model_validate(tab.filter_payload_json or {}),
    )


@router.delete("/views/{view_id}/tabs/{tab_id}", status_code=204, response_class=Response)
def delete_view_tab(
    view_id: str,
    tab_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> Response:
    view = _ensure_view_access(db, view_id, tenant.id, user.id, request, access="write")
    tab = db.scalar(
        select(ViewTabModel).where(
            ViewTabModel.id == tab_id,
            ViewTabModel.view_id == view.id,
            ViewTabModel.tenant_id == tenant.id,
        )
    )
    if not tab:
        raise HTTPException(status_code=404, detail="标签不存在")
    if tab.owner_user_id and tab.owner_user_id != user.id and tab.visibility != "shared":
        raise HTTPException(status_code=403, detail="仅标签创建者可删除个人标签")
    db.delete(tab)
    db.commit()
    return Response(status_code=204)


@router.get("/views/{view_id}/kanban-columns", response_model=KanbanColumnsOut)
def get_kanban_columns(
    view_id: str,
    request: Request,
    filters: str | None = Query(default=None),
    sorts: str | None = Query(default=None),
    filterLogic: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> KanbanColumnsOut:
    view = _ensure_view_access(db, view_id, tenant.id, user.id, request, access="read")
    status_field = _resolve_status_field_for_table(db, tenant.id, view.table_id)
    if not status_field:
        raise HTTPException(status_code=400, detail="当前表未配置状态字段，无法展示看板")
    options = _field_options(status_field)
    if not options:
        raise HTTPException(status_code=400, detail="状态字段未配置可用选项")
    fields = db.scalars(
        select(FieldModel).where(
            FieldModel.table_id == view.table_id,
            FieldModel.tenant_id == tenant.id,
        )
    ).all()
    fields_by_id = {field.id: field for field in fields}
    title_field_id, owner_field_id, due_field_id = _infer_display_field_ids(fields)

    query_filters = _parse_json_list(filters, "filters") if filters is not None else list((view.config_json or {}).get("filters", []))
    query_sorts = _parse_json_list(sorts, "sorts") if sorts is not None else list((view.config_json or {}).get("sorts", []))
    query_filter_logic = (filterLogic or str((view.config_json or {}).get("filterLogic", "and"))).lower()
    resolved_filters = _resolve_dynamic_filters(query_filters, user)
    resolved_filter_logic = "or" if query_filter_logic == "or" else "and"

    records = db.scalars(
        select(RecordModel)
        .where(
            RecordModel.table_id == view.table_id,
            RecordModel.tenant_id == tenant.id,
        )
        .options(joinedload(RecordModel.values))
        .order_by(RecordModel.updated_at.desc(), RecordModel.id.desc())
    ).unique().all()
    filtered = apply_filters_and_sorts(records, fields_by_id, resolved_filters, query_sorts, resolved_filter_logic)

    columns_by_option: dict[str, KanbanColumnOut] = {
        option.id: KanbanColumnOut(
            optionId=option.id,
            name=option.name,
            color=option.color,
            count=0,
            items=[],
        )
        for option in options
    }
    for record in filtered:
        values_map = {item.field_id: item.value_json for item in record.values}
        status_value = values_map.get(status_field.id)
        if not isinstance(status_value, str):
            continue
        column = columns_by_option.get(status_value)
        if not column:
            continue
        title = str(values_map.get(title_field_id) or f"记录 {record.id}")
        owner = str(values_map.get(owner_field_id)) if owner_field_id and values_map.get(owner_field_id) is not None else None
        due_value = values_map.get(due_field_id) if due_field_id else None
        due_date = str(due_value) if due_value is not None else None
        column.items.append(
            KanbanCardOut(
                recordId=record.id,
                tableId=record.table_id,
                version=int(record.version or 0),
                statusOptionId=status_value,
                title=title,
                owner=owner,
                dueDate=due_date,
                values=values_map,
            )
        )
    for column in columns_by_option.values():
        column.count = len(column.items)
        column.items.sort(key=lambda item: item.recordId)

    return KanbanColumnsOut(
        viewId=view.id,
        tableId=view.table_id,
        statusFieldId=status_field.id,
        columns=[columns_by_option[item.id] for item in options],
    )


@router.post("/views/{view_id}/kanban-move", response_model=StatusTransitionOut)
def move_kanban_card(
    view_id: str,
    payload: KanbanMoveIn,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
) -> StatusTransitionOut:
    _ensure_view_access(db, view_id, tenant.id, user.id, request, access="write")
    transition_payload = StatusTransitionIn(
        toStatusOptionId=payload.toStatusOptionId,
        source="kanban",
        expectedVersion=payload.expectedVersion,
    )
    return transition_record_status(
        payload.recordId,
        transition_payload,
        request,
        db,
        user,
        tenant,
    )


def _get_or_create_workflow_config(
    db: Session,
    tenant_id: str,
    table_id: str,
) -> TableWorkflowConfigModel:
    existing = db.scalar(
        select(TableWorkflowConfigModel).where(
            TableWorkflowConfigModel.tenant_id == tenant_id,
            TableWorkflowConfigModel.table_id == table_id,
        )
    )
    if existing:
        return existing
    created = TableWorkflowConfigModel(
        tenant_id=tenant_id,
        table_id=table_id,
        status_field_id=None,
        allow_any_transition=True,
        final_status_option_ids_json=[],
        created_at=now_utc_naive(),
        updated_at=now_utc_naive(),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return created


def _load_status_field(
    db: Session,
    tenant_id: str,
    table_id: str,
    field_id: str | None,
) -> FieldModel | None:
    if not field_id:
        return None
    field = db.scalar(
        select(FieldModel).where(
            FieldModel.id == field_id,
            FieldModel.table_id == table_id,
            FieldModel.tenant_id == tenant_id,
        )
    )
    if not field or field.type != "singleSelect":
        return None
    return field


def _field_options(field: FieldModel | None) -> list[FieldOptionOut]:
    if not field:
        return []
    raw = field.options_json or []
    options: list[FieldOptionOut] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        option_id = str(item.get("id") or "").strip()
        if not option_id:
            continue
        options.append(
            FieldOptionOut(
                id=option_id,
                name=str(item.get("name") or option_id),
                color=str(item.get("color")) if item.get("color") is not None else None,
                parentId=str(item.get("parentId")) if item.get("parentId") is not None else None,
            )
        )
    return options


def _ensure_workflow_manage_allowed(db: Session, user_id: str, tenant_id: str) -> None:
    membership = _get_membership(db, user_id, tenant_id)
    if not membership:
        raise HTTPException(status_code=403, detail="当前租户无权限")
    if membership.role == "owner" or membership.role_key == "admin":
        return
    role = db.scalar(
        select(TenantRoleModel).where(
            TenantRoleModel.tenant_id == tenant_id,
            TenantRoleModel.key == membership.role_key,
        )
    )
    if role and role.can_manage_permissions:
        return
    raise HTTPException(status_code=403, detail="仅管理员可配置工作流")


def _ensure_view_access(
    db: Session,
    view_id: str,
    tenant_id: str,
    user_id: str,
    request: Request,
    *,
    access: str,
) -> ViewModel:
    view = _ensure_view_exists(db, view_id, tenant_id, request, user_id)
    _ensure_table_access(
        db,
        table_id=view.table_id,
        tenant_id=tenant_id,
        user_id=user_id,
        request=request,
        access="read" if access == "read" else "write",
    )
    role = _get_membership_role(db, user_id, tenant_id)
    if role == "owner":
        return view
    permission = db.scalar(
        select(ViewPermissionModel).where(
            ViewPermissionModel.tenant_id == tenant_id,
            ViewPermissionModel.view_id == view_id,
            ViewPermissionModel.user_id == user_id,
        )
    )
    if not permission:
        raise HTTPException(status_code=403, detail="无该视图访问权限")
    has_access = permission.can_write if access == "write" else (permission.can_read or permission.can_write)
    if not has_access:
        raise HTTPException(status_code=403, detail="无该视图访问权限")
    return view


def _ensure_record_with_values(db: Session, tenant_id: str, record_id: str) -> RecordModel:
    record = db.scalar(
        select(RecordModel)
        .where(
            RecordModel.id == record_id,
            RecordModel.tenant_id == tenant_id,
        )
        .options(joinedload(RecordModel.values))
    )
    if record:
        return record
    raise HTTPException(status_code=404, detail="记录不存在")


def _resolve_status_field_for_table(db: Session, tenant_id: str, table_id: str) -> FieldModel | None:
    config = _get_or_create_workflow_config(db, tenant_id, table_id)
    configured = _load_status_field(db, tenant_id, table_id, config.status_field_id)
    if configured:
        return configured
    all_fields = db.scalars(
        select(FieldModel)
        .where(
            FieldModel.tenant_id == tenant_id,
            FieldModel.table_id == table_id,
        )
        .order_by(FieldModel.sort_order.asc())
    ).all()
    by_name = _find_first_field(
        all_fields,
        preferred_names=("状态", "state", "status"),
        allowed_types={"singleSelect"},
    )
    if by_name:
        return by_name
    return _find_first_field(
        all_fields,
        preferred_names=(),
        allowed_types={"singleSelect"},
    )


def _build_system_tabs(
    db: Session,
    tenant_id: str,
    table_id: str,
    view_id: str,
    user: UserModel,
) -> list[ViewTabOut]:
    fields = db.scalars(
        select(FieldModel)
        .where(
            FieldModel.tenant_id == tenant_id,
            FieldModel.table_id == table_id,
        )
        .order_by(FieldModel.sort_order.asc())
    ).all()
    status_field = _resolve_status_field_for_table(db, tenant_id, table_id)
    config = _get_or_create_workflow_config(db, tenant_id, table_id)
    final_status_ids = list(dict.fromkeys(config.final_status_option_ids_json or []))
    owner_field = _find_first_field(
        fields,
        preferred_names=("负责人", "owner", "assignee", "指派"),
        allowed_types={"member", "text", "singleSelect"},
    )
    due_field = _find_first_field(
        fields,
        preferred_names=("截止", "到期", "due", "计划完成", "结束日期"),
        allowed_types={"date"},
    )

    user_markers = [item for item in [user.id, user.username, user.account] if item]
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    tabs: list[ViewTabOut] = [
        ViewTabOut(
            id="sys_all",
            viewId=view_id,
            tableId=table_id,
            name="全部",
            visibility="system",
            ownerUserId=None,
            isSystemPreset=True,
            sortOrder=0,
            payload=ViewTabPayload(filters=[], sorts=[], filterLogic="and"),
        )
    ]
    if owner_field and user_markers:
        tabs.append(
            ViewTabOut(
                id="sys_my_tasks",
                viewId=view_id,
                tableId=table_id,
                name="我的工单",
                visibility="system",
                ownerUserId=user.id,
                isSystemPreset=True,
                sortOrder=1,
                payload=ViewTabPayload(
                    filters=[{"fieldId": owner_field.id, "op": "in", "value": user_markers}],
                    sorts=[],
                    filterLogic="and",
                ),
            )
        )
    if status_field and final_status_ids:
        tabs.append(
            ViewTabOut(
                id="sys_unfinished",
                viewId=view_id,
                tableId=table_id,
                name="未完成",
                visibility="system",
                ownerUserId=None,
                isSystemPreset=True,
                sortOrder=2,
                payload=ViewTabPayload(
                    filters=[{"fieldId": status_field.id, "op": "nin", "value": final_status_ids}],
                    sorts=[],
                    filterLogic="and",
                ),
            )
        )
        tabs.append(
            ViewTabOut(
                id="sys_done",
                viewId=view_id,
                tableId=table_id,
                name="已完成",
                visibility="system",
                ownerUserId=None,
                isSystemPreset=True,
                sortOrder=3,
                payload=ViewTabPayload(
                    filters=[{"fieldId": status_field.id, "op": "in", "value": final_status_ids}],
                    sorts=[],
                    filterLogic="and",
                ),
            )
        )
    if due_field:
        tabs.append(
            ViewTabOut(
                id="sys_due_this_week",
                viewId=view_id,
                tableId=table_id,
                name="本周到期",
                visibility="system",
                ownerUserId=None,
                isSystemPreset=True,
                sortOrder=4,
                payload=ViewTabPayload(
                    filters=[
                        {"fieldId": due_field.id, "op": "gte", "value": week_start.isoformat()},
                        {"fieldId": due_field.id, "op": "lte", "value": week_end.isoformat()},
                    ],
                    sorts=[],
                    filterLogic="and",
                ),
            )
        )
        overdue_filters: list[dict[str, Any]] = [
            {"fieldId": due_field.id, "op": "lt", "value": today.isoformat()},
        ]
        if status_field and final_status_ids:
            overdue_filters.append({"fieldId": status_field.id, "op": "nin", "value": final_status_ids})
        tabs.append(
            ViewTabOut(
                id="sys_overdue_unfinished",
                viewId=view_id,
                tableId=table_id,
                name="逾期未完成",
                visibility="system",
                ownerUserId=None,
                isSystemPreset=True,
                sortOrder=5,
                payload=ViewTabPayload(
                    filters=overdue_filters,
                    sorts=[],
                    filterLogic="and",
                ),
            )
        )
    return tabs


def _find_first_field(
    fields: list[FieldModel],
    *,
    preferred_names: tuple[str, ...],
    allowed_types: set[str] | None = None,
) -> FieldModel | None:
    normalized_names = [item.lower() for item in preferred_names if item]
    for field in fields:
        if allowed_types and field.type not in allowed_types:
            continue
        lower_name = field.name.lower()
        if any(token in lower_name for token in normalized_names):
            return field
    for field in fields:
        if allowed_types and field.type not in allowed_types:
            continue
        return field
    return None


def _infer_display_field_ids(fields: list[FieldModel]) -> tuple[str | None, str | None, str | None]:
    title_field = _find_first_field(
        fields,
        preferred_names=("标题", "名称", "主题", "任务", "需求", "title", "name"),
        allowed_types={"text"},
    )
    if not title_field:
        title_field = _find_first_field(
            fields,
            preferred_names=("标题", "名称", "主题", "任务", "需求", "title", "name"),
            allowed_types=None,
        )
    owner_field = _find_first_field(
        fields,
        preferred_names=("负责人", "owner", "assignee", "指派"),
        allowed_types={"member", "text", "singleSelect"},
    )
    due_field = _find_first_field(
        fields,
        preferred_names=("截止", "到期", "due", "计划完成", "结束日期"),
        allowed_types={"date"},
    )
    return (
        title_field.id if title_field else None,
        owner_field.id if owner_field else None,
        due_field.id if due_field else None,
    )


def _parse_json_list(raw: str | None, name: str) -> list[dict[str, Any]]:
    if raw is None:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{name} 参数不是合法 JSON") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail=f"{name} 参数必须是数组")
    result: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"{name} 数组元素必须是对象")
        result.append(item)
    return result


def _resolve_dynamic_filters(filters: list[dict[str, Any]], user: UserModel) -> list[dict[str, Any]]:
    if not filters:
        return []

    def _resolve_value(value: Any) -> Any:
        if isinstance(value, str):
            token = value.strip().lower()
            today = date.today()
            if token in {"$today", "{{today}}"}:
                return today.isoformat()
            if token in {"$weekstart", "{{week_start}}"}:
                return (today - timedelta(days=today.weekday())).isoformat()
            if token in {"$weekend", "{{week_end}}"}:
                return (today - timedelta(days=today.weekday()) + timedelta(days=6)).isoformat()
            if token in {"$currentuserid", "{{current_user_id}}"}:
                return user.id
            if token in {"$currentuser", "{{current_user}}"}:
                return user.username or user.id
        if isinstance(value, list):
            return [_resolve_value(item) for item in value]
        return value

    resolved: list[dict[str, Any]] = []
    for raw in filters:
        item = dict(raw)
        original_value = item.get("value")
        op = str(item.get("op", "contains")).lower()
        if isinstance(original_value, str) and original_value.strip().lower() in {"$currentuser", "{{current_user}}"}:
            markers = [entry for entry in [user.id, user.username, user.account] if entry]
            item["op"] = "nin" if op == "neq" else "in"
            item["value"] = markers
        else:
            item["value"] = _resolve_value(original_value)
        resolved.append(item)
    return resolved
