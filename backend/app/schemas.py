from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


FieldType = Literal["text", "number", "date", "singleSelect", "multiSelect", "checkbox", "attachment", "image", "member"]
ViewType = Literal["grid", "form", "kanban"]
FilterLogic = Literal["and", "or"]


class FieldOptionOut(BaseModel):
    id: str
    name: str
    color: str | None = None
    parentId: str | None = None


class FieldOut(BaseModel):
    id: str
    tableId: str
    name: str
    type: FieldType
    width: int | None = None
    options: list[FieldOptionOut] | None = None


class FieldCreateIn(BaseModel):
    name: str
    type: FieldType = "text"
    width: int | None = 180
    options: list[FieldOptionOut] | None = None


class ViewConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    hiddenFieldIds: list[str] = Field(default_factory=list)
    fieldOrderIds: list[str] = Field(default_factory=list)
    columnWidths: dict[str, int] = Field(default_factory=dict)
    sorts: list[dict[str, Any]] = Field(default_factory=list)
    filters: list[dict[str, Any]] = Field(default_factory=list)
    isEnabled: bool = True
    order: int = 0
    filterLogic: FilterLogic = "and"
    filterPresets: list[dict[str, Any]] = Field(default_factory=list)
    formSettings: dict[str, Any] | None = None


class ViewOut(BaseModel):
    id: str
    tableId: str
    name: str
    type: ViewType
    config: ViewConfig

class ViewCreateIn(BaseModel):
    name: str
    type: ViewType = "grid"
    config: ViewConfig | None = None


class ViewPatchIn(BaseModel):
    name: str | None = None
    type: ViewType | None = None
    config: ViewConfig | None = None


class ImportViewFieldIn(BaseModel):
    name: str
    type: FieldType = "text"
    width: int | None = 180
    options: list[FieldOptionOut] | None = None


class ImportViewBundleIn(BaseModel):
    viewName: str
    viewType: ViewType = "grid"
    fields: list[ImportViewFieldIn] = Field(default_factory=list)
    records: list[dict[str, Any]] = Field(default_factory=list)


class ImportViewBundleLegacyIn(ImportViewBundleIn):
    tableId: str | None = None


class ImportViewBundleOut(BaseModel):
    viewId: str
    viewName: str
    fieldIds: list[str]
    recordCount: int


class RecordOut(BaseModel):
    id: str
    tableId: str
    version: int = 0
    values: dict[str, Any]


class RecordPageOut(BaseModel):
    items: list[RecordOut]
    nextCursor: str | None = None
    totalCount: int = 0


class RecordPatchIn(BaseModel):
    valuesPatch: dict[str, Any]
    expectedVersion: int | None = None


class CreateRecordIn(BaseModel):
    initialValues: dict[str, Any] = Field(default_factory=dict)


class RecordQueryIn(BaseModel):
    viewId: str | None = None
    cursor: str | None = None
    pageSize: int = Field(default=100, ge=1, le=500)
    filters: list[dict[str, Any]] | None = None
    sorts: list[dict[str, Any]] | None = None
    filterLogic: FilterLogic | None = None


class HealthOut(BaseModel):
    status: str


class ErrorOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    detail: str


class LoginIn(BaseModel):
    username: str
    password: str


class TenantOut(BaseModel):
    id: str
    name: str


class TenantCreateIn(BaseModel):
    name: str


class UserProfileOut(BaseModel):
    id: str
    username: str
    account: str | None = None
    email: str | None = None
    mobile: str | None = None
    defaultTenantId: str | None = None


class MembershipOut(BaseModel):
    userId: str
    tenantId: str
    role: str
    roleKey: str


class MeOut(BaseModel):
    user: UserProfileOut
    currentTenant: TenantOut
    role: str
    roleKey: str
    tenants: list[TenantOut]


class AuthTokenOut(BaseModel):
    accessToken: str
    tokenType: Literal["bearer"] = "bearer"
    expiresIn: int
    currentTenant: TenantOut
    requiresPasswordChange: bool = False


class SwitchTenantIn(BaseModel):
    tenantId: str


class RemoveMemberIn(BaseModel):
    userId: str


class TenantMemberOut(BaseModel):
    userId: str
    username: str
    role: str
    roleKey: str
    roleName: str
    temporaryPassword: str | None = None


class CreateMemberIn(BaseModel):
    username: str
    account: str | None = None
    password: str | None = None
    email: str | None = None
    mobile: str | None = None
    roleKey: str | None = None


class FirstLoginChangePasswordIn(BaseModel):
    account: str
    password: str
    newPassword: str


class UpdateMemberRoleIn(BaseModel):
    roleKey: str


class TenantRoleOut(BaseModel):
    key: str
    name: str
    canManageMembers: bool
    canManagePermissions: bool
    defaultTableCanRead: bool
    defaultTableCanWrite: bool


class TenantRoleCreateIn(BaseModel):
    key: str
    name: str
    canManageMembers: bool = False
    canManagePermissions: bool = False
    defaultTableCanRead: bool = True
    defaultTableCanWrite: bool = False


class TenantRolePatchIn(BaseModel):
    name: str | None = None
    canManageMembers: bool | None = None
    canManagePermissions: bool | None = None
    defaultTableCanRead: bool | None = None
    defaultTableCanWrite: bool | None = None


class TablePermissionItemIn(BaseModel):
    userId: str
    canRead: bool = True
    canWrite: bool = False


class TablePermissionItemOut(BaseModel):
    userId: str
    username: str
    canRead: bool
    canWrite: bool


class TablePermissionPatchIn(BaseModel):
    items: list[TablePermissionItemIn] = Field(default_factory=list)


class TableButtonPermissionSet(BaseModel):
    canCreateRecord: bool = True
    canDeleteRecord: bool = True
    canImportRecords: bool = True
    canExportRecords: bool = True
    canManageFilters: bool = True
    canManageSorts: bool = True


class TableButtonPermissionItemIn(BaseModel):
    userId: str
    buttons: TableButtonPermissionSet


class TableButtonPermissionItemOut(BaseModel):
    userId: str
    username: str
    buttons: TableButtonPermissionSet


class TableButtonPermissionPatchIn(BaseModel):
    items: list[TableButtonPermissionItemIn] = Field(default_factory=list)


class ViewPermissionItemIn(BaseModel):
    userId: str
    canRead: bool = True
    canWrite: bool = False


class ViewPermissionItemOut(BaseModel):
    userId: str
    username: str
    canRead: bool
    canWrite: bool


class ViewPermissionPatchIn(BaseModel):
    items: list[ViewPermissionItemIn] = Field(default_factory=list)


class ReferenceMemberOut(BaseModel):
    userId: str
    username: str


class WorkflowConfigOut(BaseModel):
    tableId: str
    statusFieldId: str | None = None
    allowAnyTransition: bool = True
    finalStatusOptionIds: list[str] = Field(default_factory=list)
    statusOptions: list[FieldOptionOut] = Field(default_factory=list)


class WorkflowConfigPatchIn(BaseModel):
    statusFieldId: str | None = None
    allowAnyTransition: bool = True
    finalStatusOptionIds: list[str] = Field(default_factory=list)


class WorkflowTransitionIn(BaseModel):
    fromOptionId: str
    toOptionIds: list[str] = Field(default_factory=list)


class WorkflowTransitionPairOut(BaseModel):
    fromOptionId: str
    toOptionId: str


class WorkflowTransitionPatchIn(BaseModel):
    transitions: list[WorkflowTransitionIn] = Field(default_factory=list)


class StatusTransitionIn(BaseModel):
    toStatusOptionId: str
    source: Literal["kanban", "drawer", "api"] = "api"
    expectedVersion: int | None = None


class StatusTransitionOut(BaseModel):
    record: RecordOut
    fromStatusOptionId: str | None = None
    toStatusOptionId: str


class RecordStatusLogOut(BaseModel):
    id: int
    recordId: str
    tableId: str
    statusFieldId: str | None = None
    fromOptionId: str | None = None
    toOptionId: str
    operatorUserId: str | None = None
    operatorUsername: str | None = None
    source: str
    createdAt: str


class ViewTabPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    filterLogic: FilterLogic = "and"
    filters: list[dict[str, Any]] = Field(default_factory=list)
    sorts: list[dict[str, Any]] = Field(default_factory=list)


class ViewTabOut(BaseModel):
    id: str
    viewId: str
    tableId: str
    name: str
    visibility: Literal["personal", "shared", "system"]
    ownerUserId: str | None = None
    isSystemPreset: bool = False
    sortOrder: int = 0
    payload: ViewTabPayload = Field(default_factory=ViewTabPayload)


class ViewTabCreateIn(BaseModel):
    name: str
    visibility: Literal["personal", "shared"] = "personal"
    payload: ViewTabPayload = Field(default_factory=ViewTabPayload)
    sortOrder: int | None = None


class ViewTabPatchIn(BaseModel):
    name: str | None = None
    visibility: Literal["personal", "shared"] | None = None
    payload: ViewTabPayload | None = None
    sortOrder: int | None = None


class KanbanCardOut(BaseModel):
    recordId: str
    tableId: str
    version: int = 0
    statusOptionId: str
    title: str
    owner: str | None = None
    dueDate: str | None = None
    values: dict[str, Any] = Field(default_factory=dict)


class KanbanColumnOut(BaseModel):
    optionId: str
    name: str
    color: str | None = None
    count: int = 0
    items: list[KanbanCardOut] = Field(default_factory=list)


class KanbanColumnsOut(BaseModel):
    viewId: str
    tableId: str
    statusFieldId: str
    columns: list[KanbanColumnOut] = Field(default_factory=list)


class KanbanMoveIn(BaseModel):
    recordId: str
    fromStatusOptionId: str | None = None
    toStatusOptionId: str
    expectedVersion: int | None = None


ConnectorMode = Literal["config", "plugin"]
HttpMethod = Literal["GET", "POST"]
ConnectorAuthType = Literal["none", "bearer", "basic", "api_key"]
ExecutionStatus = Literal["running", "success", "failed"]


class CredentialCreateIn(BaseModel):
    name: str
    authType: ConnectorAuthType
    secret: str


class CredentialOut(BaseModel):
    id: str
    name: str
    authType: ConnectorAuthType
    maskedSecret: str
    createdAt: str


class FieldMappingIn(BaseModel):
    sourceKey: str
    targetFieldId: str
    targetFieldLabel: str | None = None
    transform: str | None = None


class FieldMappingOut(BaseModel):
    id: str
    sourceKey: str
    targetFieldId: str
    targetFieldLabel: str
    transform: str | None = None


class ConnectorScheduleIn(BaseModel):
    cronExpr: str = "0 8 * * *"
    isEnabled: bool = True


class ConnectorScheduleOut(BaseModel):
    cronExpr: str
    isEnabled: bool
    nextRunAt: str | None = None


class ApiConnectorCreateIn(BaseModel):
    name: str
    description: str | None = None
    tableId: str
    mode: ConnectorMode = "config"
    method: HttpMethod = "GET"
    url: str
    authType: ConnectorAuthType = "none"
    credentialId: str | None = None
    requestParams: dict[str, Any] = Field(default_factory=dict)
    requestHeaders: dict[str, Any] = Field(default_factory=dict)
    responsePath: str | None = None
    isEnabled: bool = True
    fieldMappings: list[FieldMappingIn] = Field(default_factory=list)
    schedule: ConnectorScheduleIn = Field(default_factory=ConnectorScheduleIn)


class ApiConnectorPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    tableId: str | None = None
    mode: ConnectorMode | None = None
    method: HttpMethod | None = None
    url: str | None = None
    authType: ConnectorAuthType | None = None
    credentialId: str | None = None
    requestParams: dict[str, Any] | None = None
    requestHeaders: dict[str, Any] | None = None
    responsePath: str | None = None
    isEnabled: bool | None = None
    fieldMappings: list[FieldMappingIn] | None = None


class ApiConnectorOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    tableId: str
    tableName: str
    mode: ConnectorMode
    method: HttpMethod
    url: str
    authType: ConnectorAuthType
    credentialId: str | None = None
    requestParams: dict[str, Any] = Field(default_factory=dict)
    requestHeaders: dict[str, Any] = Field(default_factory=dict)
    responsePath: str | None = None
    isEnabled: bool = True
    createdAt: str
    updatedAt: str
    lastRunAt: str | None = None
    lastStatus: ExecutionStatus | None = None
    totalRuns: int = 0
    successRuns: int = 0
    fieldMappings: list[FieldMappingOut] = Field(default_factory=list)
    schedule: ConnectorScheduleOut


class ExecutionLogOut(BaseModel):
    id: str
    connectorId: str
    connectorName: str
    startedAt: str
    finishedAt: str | None = None
    status: ExecutionStatus
    rowsWritten: int
    errorMsg: str | None = None
    rawLog: str | None = None


class ConnectorRunResultOut(BaseModel):
    status: Literal["success", "failed"]
    rowsWritten: int
    errorMsg: str | None = None


class IntegrationStatsOut(BaseModel):
    totalConnectors: int = 0
    enabledConnectors: int = 0
    runsToday: int = 0
    successRate: int = 0
    failureCount: int = 0
    runningCount: int = 0
