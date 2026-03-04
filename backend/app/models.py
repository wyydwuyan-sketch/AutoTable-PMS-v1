from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class BaseModel(Base):
    __tablename__ = "bases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    tenant: Mapped["TenantModel"] = relationship(back_populates="bases")
    tables: Mapped[list["TableModel"]] = relationship(back_populates="base", cascade="all, delete-orphan")


class TableModel(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    base_id: Mapped[str] = mapped_column(ForeignKey("bases.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    tenant: Mapped["TenantModel"] = relationship(back_populates="tables")
    base: Mapped[BaseModel] = relationship(back_populates="tables")
    views: Mapped[list["ViewModel"]] = relationship(back_populates="table", cascade="all, delete-orphan")
    fields: Mapped[list["FieldModel"]] = relationship(back_populates="table", cascade="all, delete-orphan")
    records: Mapped[list["RecordModel"]] = relationship(back_populates="table", cascade="all, delete-orphan")
    permissions: Mapped[list["TablePermissionModel"]] = relationship(back_populates="table", cascade="all, delete-orphan")
    workflow_config: Mapped["TableWorkflowConfigModel | None"] = relationship(
        back_populates="table",
        cascade="all, delete-orphan",
        uselist=False,
    )
    workflow_transitions: Mapped[list["WorkflowTransitionModel"]] = relationship(
        back_populates="table",
        cascade="all, delete-orphan",
    )
    status_logs: Mapped[list["RecordStatusLogModel"]] = relationship(
        back_populates="table",
        cascade="all, delete-orphan",
    )
    view_tabs: Mapped[list["ViewTabModel"]] = relationship(
        back_populates="table",
        cascade="all, delete-orphan",
    )
    api_connectors: Mapped[list["ApiConnectorModel"]] = relationship(
        back_populates="table",
        cascade="all, delete-orphan",
    )


class ViewModel(Base):
    __tablename__ = "views"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="grid")
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    tenant: Mapped["TenantModel"] = relationship(back_populates="views")
    table: Mapped[TableModel] = relationship(back_populates="views")
    permissions: Mapped[list["ViewPermissionModel"]] = relationship(back_populates="view", cascade="all, delete-orphan")
    tabs: Mapped[list["ViewTabModel"]] = relationship(back_populates="view", cascade="all, delete-orphan")


class FieldModel(Base):
    __tablename__ = "fields"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    options_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tenant: Mapped["TenantModel"] = relationship(back_populates="fields")
    table: Mapped[TableModel] = relationship(back_populates="fields")
    values: Mapped[list["RecordValueModel"]] = relationship(back_populates="field", cascade="all, delete-orphan")


class RecordModel(Base):
    __tablename__ = "records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tenant: Mapped["TenantModel"] = relationship(back_populates="records")
    table: Mapped[TableModel] = relationship(back_populates="records")
    values: Mapped[list["RecordValueModel"]] = relationship(back_populates="record", cascade="all, delete-orphan")
    status_logs: Mapped[list["RecordStatusLogModel"]] = relationship(back_populates="record", cascade="all, delete-orphan")


class RecordValueModel(Base):
    __tablename__ = "record_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("records.id"), index=True, nullable=False)
    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id"), index=True, nullable=False)
    value_json: Mapped[Any] = mapped_column(JSON, nullable=True)

    record: Mapped[RecordModel] = relationship(back_populates="values")
    field: Mapped[FieldModel] = relationship(back_populates="values")


class TenantModel(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    bases: Mapped[list[BaseModel]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    tables: Mapped[list[TableModel]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    views: Mapped[list[ViewModel]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    fields: Mapped[list[FieldModel]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    records: Mapped[list[RecordModel]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    memberships: Mapped[list["MembershipModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    roles: Mapped[list["TenantRoleModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    table_permissions: Mapped[list["TablePermissionModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    view_permissions: Mapped[list["ViewPermissionModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    users_with_default: Mapped[list["UserModel"]] = relationship(back_populates="default_tenant")
    workflow_configs: Mapped[list["TableWorkflowConfigModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    workflow_transitions: Mapped[list["WorkflowTransitionModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    record_status_logs: Mapped[list["RecordStatusLogModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    view_tabs: Mapped[list["ViewTabModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    credentials: Mapped[list["CredentialModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    api_connectors: Mapped[list["ApiConnectorModel"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class TenantRoleModel(Base):
    __tablename__ = "tenant_roles"
    __table_args__ = (UniqueConstraint("tenant_id", "key", name="uq_tenant_role_tenant_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    can_manage_members: Mapped[bool] = mapped_column(nullable=False, default=False)
    can_manage_permissions: Mapped[bool] = mapped_column(nullable=False, default=False)
    default_table_can_read: Mapped[bool] = mapped_column(nullable=False, default=True)
    default_table_can_write: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="roles")


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    account: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(64), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    default_tenant: Mapped[TenantModel | None] = relationship(back_populates="users_with_default")
    memberships: Mapped[list["MembershipModel"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    table_permissions: Mapped[list["TablePermissionModel"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    view_permissions: Mapped[list["ViewPermissionModel"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class MembershipModel(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", name="uq_membership_user_tenant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="member")
    role_key: Mapped[str] = mapped_column(String(64), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    user: Mapped[UserModel] = relationship(back_populates="memberships")
    tenant: Mapped[TenantModel] = relationship(back_populates="memberships")


class TablePermissionModel(Base):
    __tablename__ = "table_permissions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "table_id", "user_id", name="uq_table_permission_tenant_table_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    can_read: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_write: Mapped[bool] = mapped_column(nullable=False, default=False)
    can_create_record: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_delete_record: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_import_records: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_export_records: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_manage_filters: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_manage_sorts: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="table_permissions")
    table: Mapped[TableModel] = relationship(back_populates="permissions")
    user: Mapped[UserModel] = relationship(back_populates="table_permissions")


class ViewPermissionModel(Base):
    __tablename__ = "view_permissions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "view_id", "user_id", name="uq_view_permission_tenant_view_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    view_id: Mapped[str] = mapped_column(ForeignKey("views.id"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    can_read: Mapped[bool] = mapped_column(nullable=False, default=True)
    can_write: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="view_permissions")
    view: Mapped[ViewModel] = relationship(back_populates="permissions")
    user: Mapped[UserModel] = relationship(back_populates="view_permissions")


class TableWorkflowConfigModel(Base):
    __tablename__ = "table_workflow_configs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "table_id", name="uq_table_workflow_config_tenant_table"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    status_field_id: Mapped[str | None] = mapped_column(ForeignKey("fields.id"), index=True, nullable=True)
    allow_any_transition: Mapped[bool] = mapped_column(nullable=False, default=True)
    final_status_option_ids_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="workflow_configs")
    table: Mapped[TableModel] = relationship(back_populates="workflow_config")
    status_field: Mapped[FieldModel | None] = relationship()


class WorkflowTransitionModel(Base):
    __tablename__ = "workflow_transitions"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "table_id",
            "from_option_id",
            "to_option_id",
            name="uq_workflow_transition_tenant_table_from_to",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    from_option_id: Mapped[str] = mapped_column(String(128), nullable=False)
    to_option_id: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="workflow_transitions")
    table: Mapped[TableModel] = relationship(back_populates="workflow_transitions")


class RecordStatusLogModel(Base):
    __tablename__ = "record_status_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    record_id: Mapped[str] = mapped_column(ForeignKey("records.id"), index=True, nullable=False)
    status_field_id: Mapped[str | None] = mapped_column(ForeignKey("fields.id"), index=True, nullable=True)
    from_option_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    to_option_id: Mapped[str] = mapped_column(String(128), nullable=False)
    operator_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="api")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="record_status_logs")
    table: Mapped[TableModel] = relationship(back_populates="status_logs")
    record: Mapped[RecordModel] = relationship(back_populates="status_logs")
    status_field: Mapped[FieldModel | None] = relationship()
    operator_user: Mapped[UserModel | None] = relationship()


class ViewTabModel(Base):
    __tablename__ = "view_tabs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    view_id: Mapped[str] = mapped_column(ForeignKey("views.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    visibility: Mapped[str] = mapped_column(String(32), nullable=False, default="personal")
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    is_system_preset: Mapped[bool] = mapped_column(nullable=False, default=False)
    filter_payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="view_tabs")
    view: Mapped[ViewModel] = relationship(back_populates="tabs")
    table: Mapped[TableModel] = relationship(back_populates="view_tabs")
    owner_user: Mapped[UserModel | None] = relationship()


class CredentialModel(Base):
    __tablename__ = "credentials"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(32), nullable=False)
    secret_encrypted: Mapped[str] = mapped_column(String(2048), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="credentials")
    connectors: Mapped[list["ApiConnectorModel"]] = relationship(back_populates="credential")


class ApiConnectorModel(Base):
    __tablename__ = "api_connectors"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="config")
    method: Mapped[str] = mapped_column(String(16), nullable=False, default="GET")
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(32), nullable=False, default="none")
    credential_id: Mapped[str | None] = mapped_column(ForeignKey("credentials.id"), index=True, nullable=True)
    request_params_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    request_headers_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    response_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    tenant: Mapped[TenantModel] = relationship(back_populates="api_connectors")
    table: Mapped[TableModel] = relationship(back_populates="api_connectors")
    credential: Mapped[CredentialModel | None] = relationship(back_populates="connectors")
    field_mappings: Mapped[list["FieldMappingModel"]] = relationship(
        back_populates="connector",
        cascade="all, delete-orphan",
    )
    schedule: Mapped["ConnectorScheduleModel | None"] = relationship(
        back_populates="connector",
        cascade="all, delete-orphan",
        uselist=False,
    )
    execution_logs: Mapped[list["ExecutionLogModel"]] = relationship(
        back_populates="connector",
        cascade="all, delete-orphan",
        order_by="ExecutionLogModel.started_at.desc()",
    )


class FieldMappingModel(Base):
    __tablename__ = "field_mappings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    connector_id: Mapped[str] = mapped_column(ForeignKey("api_connectors.id"), index=True, nullable=False)
    source_key: Mapped[str] = mapped_column(String(255), nullable=False)
    target_field_id: Mapped[str] = mapped_column(ForeignKey("fields.id"), index=True, nullable=False)
    transform: Mapped[str | None] = mapped_column(String(255), nullable=True)

    connector: Mapped[ApiConnectorModel] = relationship(back_populates="field_mappings")
    target_field: Mapped[FieldModel] = relationship()


class ConnectorScheduleModel(Base):
    __tablename__ = "connector_schedules"
    __table_args__ = (
        UniqueConstraint("connector_id", name="uq_connector_schedules_connector_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    connector_id: Mapped[str] = mapped_column(ForeignKey("api_connectors.id"), index=True, nullable=False)
    cron_expr: Mapped[str] = mapped_column(String(128), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    connector: Mapped[ApiConnectorModel] = relationship(back_populates="schedule")


class ExecutionLogModel(Base):
    __tablename__ = "execution_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    connector_id: Mapped[str] = mapped_column(ForeignKey("api_connectors.id"), index=True, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    rows_written: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_msg: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    raw_log: Mapped[str | None] = mapped_column(String(8192), nullable=True)

    connector: Mapped[ApiConnectorModel] = relationship(back_populates="execution_logs")


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    tenant_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
