from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..access_helpers import _ensure_table_access, _ensure_table_exists
from ..auth import get_current_tenant, get_current_user
from ..db import get_db
from ..models import DashboardModel, DashboardWidgetModel, TableModel, TablePermissionModel, TenantModel, UserModel
from ..schemas import (
    DashboardOut,
    DashboardTableOut,
    DashboardWidgetCreateIn,
    DashboardWidgetOut,
    DashboardWidgetPatchIn,
    WidgetDataRequest,
)
from ..services import aggregate_widget_data, now_utc_naive
from ..tenant_helpers import _get_membership, _next_id

router = APIRouter()

@router.get("/dashboards/current", response_model=DashboardOut)
def get_current_dashboard(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> DashboardOut:
    dashboard = _get_or_create_dashboard(db, tenant.id)
    return _serialize_dashboard(dashboard)


@router.get("/dashboards/tables", response_model=list[DashboardTableOut])
def list_dashboard_tables(
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[DashboardTableOut]:
    _ensure_manage_dashboard_allowed(db, user.id, tenant.id)
    membership = _get_membership(db, user.id, tenant.id)
    if not membership:
        raise HTTPException(status_code=403, detail="当前租户无权限")

    if membership.role == "owner":
        tables = db.scalars(
            select(TableModel)
            .where(TableModel.tenant_id == tenant.id)
            .order_by(TableModel.name.asc(), TableModel.id.asc())
        ).all()
    else:
        tables = db.scalars(
            select(TableModel)
            .join(
                TablePermissionModel,
                and_(
                    TablePermissionModel.tenant_id == TableModel.tenant_id,
                    TablePermissionModel.table_id == TableModel.id,
                ),
            )
            .where(
                TableModel.tenant_id == tenant.id,
                TablePermissionModel.user_id == user.id,
                or_(TablePermissionModel.can_read.is_(True), TablePermissionModel.can_write.is_(True)),
            )
            .order_by(TableModel.name.asc(), TableModel.id.asc())
        ).all()

    return [DashboardTableOut(id=item.id, baseId=item.base_id, name=item.name) for item in tables]


@router.post("/dashboards/widgets", response_model=DashboardWidgetOut)
def create_dashboard_widget(
    payload: DashboardWidgetCreateIn,
    request: Request,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> DashboardWidgetOut:
    _ensure_manage_dashboard_allowed(db, user.id, tenant.id)
    dashboard = _get_or_create_dashboard(db, tenant.id)
    if payload.tableId:
        _ensure_table_exists(db, payload.tableId, tenant.id, request, user.id)

    widget = DashboardWidgetModel(
        id=_next_id("dwd"),
        dashboard_id=dashboard.id,
        tenant_id=tenant.id,
        type=payload.type,
        title=payload.title,
        table_id=payload.tableId,
        field_ids_json=payload.fieldIds,
        aggregation=payload.aggregation,
        group_field_id=payload.groupFieldId,
        layout_json=payload.layout.model_dump(),
        config_json=payload.config,
        sort_order=payload.layout.y * 100 + payload.layout.x,
        created_at=now_utc_naive(),
    )
    db.add(widget)
    db.commit()
    db.refresh(widget)
    return _serialize_widget(widget)


@router.patch("/dashboards/widgets/{widget_id}", response_model=DashboardWidgetOut)
def update_dashboard_widget(
    widget_id: str,
    payload: DashboardWidgetPatchIn,
    request: Request,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> DashboardWidgetOut:
    _ensure_manage_dashboard_allowed(db, user.id, tenant.id)
    widget = _ensure_dashboard_widget_exists(db, widget_id, tenant.id)
    patched_fields = payload.model_fields_set

    if "tableId" in patched_fields:
        if payload.tableId:
            _ensure_table_exists(db, payload.tableId, tenant.id, request, user.id)
        widget.table_id = payload.tableId
    if "title" in patched_fields:
        widget.title = payload.title or "未命名组件"
    if "fieldIds" in patched_fields:
        widget.field_ids_json = payload.fieldIds or []
    if "aggregation" in patched_fields and payload.aggregation:
        widget.aggregation = payload.aggregation
    if "groupFieldId" in patched_fields:
        widget.group_field_id = payload.groupFieldId
    if "layout" in patched_fields and payload.layout is not None:
        widget.layout_json = payload.layout.model_dump()
    if "config" in patched_fields:
        widget.config_json = payload.config or {}
    if "sortOrder" in patched_fields and payload.sortOrder is not None:
        widget.sort_order = payload.sortOrder

    db.commit()
    db.refresh(widget)
    return _serialize_widget(widget)


@router.delete("/dashboards/widgets/{widget_id}")
def delete_dashboard_widget(
    widget_id: str,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    _ensure_manage_dashboard_allowed(db, user.id, tenant.id)
    widget = _ensure_dashboard_widget_exists(db, widget_id, tenant.id)
    db.delete(widget)
    db.commit()
    return {"ok": True}


@router.post("/dashboards/widgets/{widget_id}/data")
def get_dashboard_widget_data(
    widget_id: str,
    payload: WidgetDataRequest,
    request: Request,
    user: UserModel = Depends(get_current_user),
    tenant: TenantModel = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    widget = _ensure_dashboard_widget_exists(db, widget_id, tenant.id)
    if widget.table_id:
        _ensure_table_access(
            db,
            table_id=widget.table_id,
            tenant_id=tenant.id,
            user_id=user.id,
            request=request,
            access="read",
        )
    return aggregate_widget_data(
        db,
        widget,
        override_aggregation=payload.aggregation,
        override_group_field_id=payload.groupFieldId,
        override_date_bucket=payload.dateBucket,
        limit=payload.limit,
    )


def _get_or_create_dashboard(db: Session, tenant_id: str) -> DashboardModel:
    dashboard = db.scalar(
        select(DashboardModel)
        .where(DashboardModel.tenant_id == tenant_id)
        .order_by(DashboardModel.created_at.asc())
    )
    if dashboard:
        return dashboard
    dashboard = DashboardModel(
        id=_next_id("dash"),
        tenant_id=tenant_id,
        name="首页大屏",
        created_at=now_utc_naive(),
    )
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard


def _ensure_dashboard_widget_exists(db: Session, widget_id: str, tenant_id: str) -> DashboardWidgetModel:
    widget = db.scalar(
        select(DashboardWidgetModel).where(
            DashboardWidgetModel.id == widget_id,
            DashboardWidgetModel.tenant_id == tenant_id,
        )
    )
    if widget:
        return widget
    raise HTTPException(status_code=404, detail="Widget 不存在")


def _ensure_manage_dashboard_allowed(db: Session, user_id: str, tenant_id: str) -> None:
    membership = _get_membership(db, user_id, tenant_id)
    if not membership:
        raise HTTPException(status_code=403, detail="当前租户无权限")
    if membership.role == "owner" or membership.role_key == "admin":
        return
    raise HTTPException(status_code=403, detail="仅管理员可配置大屏")


def _serialize_widget(widget: DashboardWidgetModel) -> DashboardWidgetOut:
    layout = widget.layout_json or {"x": 0, "y": 0, "w": 4, "h": 3}
    config = widget.config_json or {}
    return DashboardWidgetOut(
        id=widget.id,
        type=widget.type,  # type: ignore[arg-type]
        title=widget.title,
        tableId=widget.table_id,
        fieldIds=widget.field_ids_json or [],
        aggregation=widget.aggregation,  # type: ignore[arg-type]
        groupFieldId=widget.group_field_id,
        layout=layout,
        config=config,
        sortOrder=widget.sort_order,
        createdAt=widget.created_at.isoformat(),
    )


def _serialize_dashboard(dashboard: DashboardModel) -> DashboardOut:
    sorted_widgets = sorted(dashboard.widgets, key=lambda item: (item.sort_order, item.created_at))
    return DashboardOut(
        id=dashboard.id,
        name=dashboard.name,
        widgets=[_serialize_widget(widget) for widget in sorted_widgets],
        createdAt=dashboard.created_at.isoformat(),
    )


