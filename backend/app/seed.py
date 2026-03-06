from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .auth import hash_password, verify_password
from .constants import DEFAULT_VIEW_CONFIG
from .constants import BUILTIN_TENANT_ROLE_DEFAULTS
from .config import TEST_ADMIN_PASSWORD, TEST_ADMIN_USERNAME
from .db import Base, engine
from .models import (
    BaseModel,
    FieldModel,
    MembershipModel,
    RecordModel,
    RecordValueModel,
    TableModel,
    TablePermissionModel,
    TableWorkflowConfigModel,
    TenantModel,
    TenantRoleModel,
    UserModel,
    ViewFolderModel,
    ViewPermissionModel,
    ViewModel,
    WorkflowTransitionModel,
)
from .services import now_utc_naive
from .tenant_helpers import _next_id


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def _ensure_default_roles(db: Session, tenant_id: str) -> None:
    existing_keys = {
        item.key
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant_id)).all()
    }
    changed = False
    for key, name, can_manage_members, can_manage_permissions, can_read, can_write in BUILTIN_TENANT_ROLE_DEFAULTS:
        if key in existing_keys:
            continue
        db.add(
            TenantRoleModel(
                tenant_id=tenant_id,
                key=key,
                name=name,
                can_manage_members=can_manage_members,
                can_manage_permissions=can_manage_permissions,
                default_table_can_read=can_read,
                default_table_can_write=can_write,
                created_at=now_utc_naive(),
            )
        )
        changed = True
    if changed:
        db.commit()


def _backfill_missing_role_default_permissions(db: Session, tenant_id: str) -> None:
    role_map = {
        item.key: item
        for item in db.scalars(select(TenantRoleModel).where(TenantRoleModel.tenant_id == tenant_id)).all()
    }
    memberships = db.scalars(
        select(MembershipModel).where(
            MembershipModel.tenant_id == tenant_id,
            MembershipModel.role != "owner",
        )
    ).all()
    if not memberships:
        return

    table_ids = [item.id for item in db.scalars(select(TableModel).where(TableModel.tenant_id == tenant_id)).all()]
    view_ids = [item.id for item in db.scalars(select(ViewModel).where(ViewModel.tenant_id == tenant_id)).all()]
    changed = False

    for membership in memberships:
        role = role_map.get((membership.role_key or "member").strip() or "member")
        if not role:
            continue
        if not (role.can_manage_permissions or role.default_table_can_write):
            continue

        can_read = role.default_table_can_read or role.default_table_can_write
        can_write = role.default_table_can_write

        has_any_table_permission = db.scalar(
            select(TablePermissionModel).where(
                TablePermissionModel.tenant_id == tenant_id,
                TablePermissionModel.user_id == membership.user_id,
            )
        )
        if not has_any_table_permission:
            for table_id in table_ids:
                db.add(
                    TablePermissionModel(
                        tenant_id=tenant_id,
                        table_id=table_id,
                        user_id=membership.user_id,
                        can_read=can_read,
                        can_write=can_write,
                        created_at=now_utc_naive(),
                    )
                )
            changed = changed or bool(table_ids)

        has_any_view_permission = db.scalar(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant_id,
                ViewPermissionModel.user_id == membership.user_id,
            )
        )
        if not has_any_view_permission:
            for view_id in view_ids:
                db.add(
                    ViewPermissionModel(
                        tenant_id=tenant_id,
                        view_id=view_id,
                        user_id=membership.user_id,
                        can_read=can_read,
                        can_write=can_write,
                        created_at=now_utc_naive(),
                    )
                )
            changed = changed or bool(view_ids)

    if changed:
        db.commit()


def _view_order_key(view: ViewModel) -> tuple[int, str]:
    config = view.config_json or {}
    return (int(config.get("order", 0)), view.id)


def _ensure_view_permissions_from_table_permissions(
    db: Session,
    tenant_id: str,
    table_id: str,
    view_id: str,
) -> None:
    table_permissions = db.scalars(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table_id,
        )
    ).all()
    for permission in table_permissions:
        existing = db.scalar(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant_id,
                ViewPermissionModel.view_id == view_id,
                ViewPermissionModel.user_id == permission.user_id,
            )
        )
        if existing:
            continue
        db.add(
            ViewPermissionModel(
                tenant_id=tenant_id,
                view_id=view_id,
                user_id=permission.user_id,
                can_read=bool(permission.can_read or permission.can_write),
                can_write=bool(permission.can_write),
                created_at=now_utc_naive(),
            )
        )


def _ensure_table_view_catalog_defaults(db: Session, tenant_id: str, table: TableModel) -> None:
    folders = db.scalars(
        select(ViewFolderModel)
        .where(ViewFolderModel.tenant_id == tenant_id, ViewFolderModel.table_id == table.id)
        .order_by(ViewFolderModel.sort_order.asc(), ViewFolderModel.id.asc())
    ).all()
    default_folder = folders[0] if folders else None
    if not default_folder:
        default_folder = ViewFolderModel(
            id=_next_id("vfd"),
            tenant_id=tenant_id,
            table_id=table.id,
            name=table.name,
            sort_order=0,
            is_enabled=True,
            created_at=now_utc_naive(),
        )
        db.add(default_folder)
        db.flush()
        folders = [default_folder]

    valid_folder_ids = {item.id for item in folders}
    views = db.scalars(
        select(ViewModel)
        .where(ViewModel.tenant_id == tenant_id, ViewModel.table_id == table.id)
        .order_by(ViewModel.id.asc())
    ).all()
    if not views:
        return

    ordered_views = sorted(views, key=_view_order_key)
    primary_views: list[ViewModel] = []
    for view in ordered_views:
        if view.type != "grid":
            continue
        if view.source_view_id is not None:
            view.source_view_id = None
        if view.view_role != "primary":
            view.view_role = "primary"
        if view.folder_id not in valid_folder_ids:
            view.folder_id = default_folder.id
        primary_views.append(view)

    if not primary_views:
        next_order = max((int((view.config_json or {}).get("order", 0)) for view in ordered_views), default=-1) + 1
        created_primary = ViewModel(
            id=_next_id("viw"),
            tenant_id=tenant_id,
            table_id=table.id,
            folder_id=default_folder.id,
            source_view_id=None,
            view_role="primary",
            name="表格",
            type="grid",
            config_json={**dict(DEFAULT_VIEW_CONFIG), "order": next_order, "isEnabled": True},
        )
        db.add(created_primary)
        db.flush()
        _ensure_view_permissions_from_table_permissions(db, tenant_id, table.id, created_primary.id)
        primary_views = [created_primary]
        ordered_views.append(created_primary)

    primary_views = sorted(primary_views, key=_view_order_key)
    primary_ids = {item.id for item in primary_views}
    default_primary = primary_views[0]
    primary_by_id = {item.id: item for item in primary_views}

    for view in ordered_views:
        if view.id in primary_ids:
            continue
        if view.view_role != "derived":
            view.view_role = "derived"
        source_view = primary_by_id.get(view.source_view_id or "")
        if source_view is None:
            source_view = default_primary
            view.source_view_id = source_view.id
        if view.folder_id != source_view.folder_id:
            view.folder_id = source_view.folder_id

    db.flush()


def _ensure_project_management_defaults(db: Session, tenant_id: str, owner_id: str) -> None:
    table = db.scalar(
        select(TableModel).where(
            TableModel.tenant_id == tenant_id,
            TableModel.id == "tbl_1",
        )
    )
    if not table:
        table = db.scalar(
            select(TableModel)
            .where(TableModel.tenant_id == tenant_id)
            .order_by(TableModel.id.asc())
        )
    if not table:
        return

    status_field = db.scalar(
        select(FieldModel).where(
            FieldModel.tenant_id == tenant_id,
            FieldModel.table_id == table.id,
            FieldModel.id == "fld_status",
        )
    )
    if not status_field:
        status_field = db.scalar(
            select(FieldModel)
            .where(
                FieldModel.tenant_id == tenant_id,
                FieldModel.table_id == table.id,
                FieldModel.type == "singleSelect",
            )
            .order_by(FieldModel.sort_order.asc(), FieldModel.id.asc())
        )

    config = db.scalar(
        select(TableWorkflowConfigModel).where(
            TableWorkflowConfigModel.tenant_id == tenant_id,
            TableWorkflowConfigModel.table_id == table.id,
        )
    )
    created_workflow = False
    if not config:
        created_workflow = True
        config = TableWorkflowConfigModel(
            tenant_id=tenant_id,
            table_id=table.id,
            status_field_id=status_field.id if status_field else None,
            allow_any_transition=False,
            final_status_option_ids_json=["已完成"],
            created_at=now_utc_naive(),
            updated_at=now_utc_naive(),
        )
        db.add(config)
    else:
        changed = False
        if not config.status_field_id and status_field:
            config.status_field_id = status_field.id
            changed = True
        if not config.final_status_option_ids_json:
            config.final_status_option_ids_json = ["已完成"]
            changed = True
        if changed:
            config.updated_at = now_utc_naive()

    if created_workflow and status_field:
        transitions = db.scalars(
            select(WorkflowTransitionModel).where(
                WorkflowTransitionModel.tenant_id == tenant_id,
                WorkflowTransitionModel.table_id == table.id,
            )
        ).all()
        if not transitions:
            for from_option_id, to_option_id in [
                ("待处理", "进行中"),
                ("待处理", "已完成"),
                ("进行中", "待处理"),
                ("进行中", "已完成"),
                ("已完成", "待处理"),
            ]:
                db.add(
                    WorkflowTransitionModel(
                        tenant_id=tenant_id,
                        table_id=table.id,
                        from_option_id=from_option_id,
                        to_option_id=to_option_id,
                        created_at=now_utc_naive(),
                    )
                )

    kanban = db.scalar(
        select(ViewModel).where(
            ViewModel.tenant_id == tenant_id,
            ViewModel.table_id == table.id,
            ViewModel.type == "kanban",
        )
    )
    if not kanban:
        preferred_id = "viw_kanban_1"
        exists_same_id = db.scalar(select(ViewModel).where(ViewModel.id == preferred_id))
        kanban = ViewModel(
            id=preferred_id if not exists_same_id else "viw_kanban_seed",
            tenant_id=tenant_id,
            table_id=table.id,
            view_role="derived",
            name="看板",
            type="kanban",
            config_json={
                "hiddenFieldIds": [],
                "fieldOrderIds": [],
                "columnWidths": {},
                "sorts": [],
                "filters": [],
                "filterLogic": "and",
                "isEnabled": True,
                "order": 1,
            },
        )
        db.add(kanban)
        db.flush()

    table_perm = db.scalar(
        select(TablePermissionModel).where(
            TablePermissionModel.tenant_id == tenant_id,
            TablePermissionModel.table_id == table.id,
            TablePermissionModel.user_id == owner_id,
        )
    )
    if not table_perm:
        db.add(
            TablePermissionModel(
                tenant_id=tenant_id,
                table_id=table.id,
                user_id=owner_id,
                can_read=True,
                can_write=True,
                created_at=now_utc_naive(),
            )
        )

    db.flush()
    _ensure_table_view_catalog_defaults(db, tenant_id, table)

    view_ids = [
        item.id
        for item in db.scalars(
            select(ViewModel).where(
                ViewModel.tenant_id == tenant_id,
                ViewModel.table_id == table.id,
            )
        ).all()
    ]
    for view_id in view_ids:
        perm = db.scalar(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant_id,
                ViewPermissionModel.view_id == view_id,
                ViewPermissionModel.user_id == owner_id,
            )
        )
        if not perm:
            db.add(
                ViewPermissionModel(
                    tenant_id=tenant_id,
                    view_id=view_id,
                    user_id=owner_id,
                    can_read=True,
                    can_write=True,
                    created_at=now_utc_naive(),
                )
            )

    db.commit()


def ensure_seed_data(db: Session) -> None:
    tenant = db.scalar(select(TenantModel).where(TenantModel.id == "tenant_default"))
    if not tenant:
        tenant = TenantModel(id="tenant_default", name="默认租户")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    _ensure_default_roles(db, tenant.id)

    owner = db.scalar(
        select(UserModel).where(
            or_(
                UserModel.username == TEST_ADMIN_USERNAME,
                UserModel.account == TEST_ADMIN_USERNAME,
            )
        )
    )
    if not owner:
        owner = db.scalar(select(UserModel).where(UserModel.id == "usr_owner"))
    if not owner:
        owner = db.scalar(
            select(UserModel).where(
                or_(
                    UserModel.username == "owner",
                    UserModel.account == "owner",
                )
            )
        )
    if not owner:
        owner = UserModel(
            id="usr_owner",
            username=TEST_ADMIN_USERNAME,
            account=TEST_ADMIN_USERNAME,
            password_hash=hash_password(TEST_ADMIN_PASSWORD),
            email=None,
            mobile=None,
            must_change_password=False,
            default_tenant_id=tenant.id,
            created_at=now_utc_naive(),
        )
        db.add(owner)
        db.commit()
        db.refresh(owner)
    else:
        changed = False
        if owner.username != TEST_ADMIN_USERNAME:
            owner.username = TEST_ADMIN_USERNAME
            changed = True
        if owner.account != TEST_ADMIN_USERNAME:
            owner.account = TEST_ADMIN_USERNAME
            changed = True
        if not verify_password(TEST_ADMIN_PASSWORD, owner.password_hash):
            owner.password_hash = hash_password(TEST_ADMIN_PASSWORD)
            changed = True
        if owner.must_change_password:
            owner.must_change_password = False
            changed = True
        if owner.default_tenant_id != tenant.id:
            owner.default_tenant_id = tenant.id
            changed = True
        if changed:
            db.commit()

    membership = db.scalar(
        select(MembershipModel).where(
            MembershipModel.user_id == owner.id,
            MembershipModel.tenant_id == tenant.id,
        )
    )
    if not membership:
        db.add(
            MembershipModel(
                user_id=owner.id,
                tenant_id=tenant.id,
                role="owner",
                role_key="owner",
                created_at=now_utc_naive(),
            )
        )
        db.commit()
    else:
        next_role_key = "owner" if membership.role == "owner" else (membership.role_key or "member")
        if membership.role_key != next_role_key:
            membership.role_key = next_role_key
            db.commit()

    db.query(BaseModel).filter(BaseModel.tenant_id.is_(None)).update({"tenant_id": tenant.id})
    db.query(TableModel).filter(TableModel.tenant_id.is_(None)).update({"tenant_id": tenant.id})
    db.query(ViewModel).filter(ViewModel.tenant_id.is_(None)).update({"tenant_id": tenant.id})
    db.query(FieldModel).filter(FieldModel.tenant_id.is_(None)).update({"tenant_id": tenant.id})
    db.query(RecordModel).filter(RecordModel.tenant_id.is_(None)).update({"tenant_id": tenant.id})
    db.commit()

    table_ids = [item.id for item in db.scalars(select(TableModel).where(TableModel.tenant_id == tenant.id)).all()]
    for table_id in table_ids:
        perm = db.scalar(
            select(TablePermissionModel).where(
                TablePermissionModel.tenant_id == tenant.id,
                TablePermissionModel.table_id == table_id,
                TablePermissionModel.user_id == owner.id,
            )
        )
        if not perm:
            db.add(
                TablePermissionModel(
                    tenant_id=tenant.id,
                    table_id=table_id,
                    user_id=owner.id,
                    can_read=True,
                    can_write=True,
                    created_at=now_utc_naive(),
                )
            )
    db.commit()

    tables = db.scalars(
        select(TableModel)
        .where(TableModel.tenant_id.is_not(None))
        .order_by(TableModel.tenant_id.asc(), TableModel.id.asc())
    ).all()
    for table in tables:
        _ensure_table_view_catalog_defaults(db, table.tenant_id, table)
    db.commit()

    view_ids = [item.id for item in db.scalars(select(ViewModel).where(ViewModel.tenant_id == tenant.id)).all()]
    for view_id in view_ids:
        perm = db.scalar(
            select(ViewPermissionModel).where(
                ViewPermissionModel.tenant_id == tenant.id,
                ViewPermissionModel.view_id == view_id,
                ViewPermissionModel.user_id == owner.id,
            )
        )
        if not perm:
            db.add(
                ViewPermissionModel(
                    tenant_id=tenant.id,
                    view_id=view_id,
                    user_id=owner.id,
                    can_read=True,
                    can_write=True,
                    created_at=now_utc_naive(),
                )
            )
    db.commit()

    existing_base = db.scalar(select(BaseModel).where(BaseModel.id == "base_1"))
    if existing_base:
        _ensure_project_management_defaults(db, tenant.id, owner.id)
        _backfill_missing_role_default_permissions(db, tenant.id)
        return

    base = BaseModel(id="base_1", tenant_id=tenant.id, name="我的多维表格")
    table = TableModel(id="tbl_1", tenant_id=tenant.id, base_id=base.id, name="项目任务")
    view = ViewModel(
        id="viw_1",
        tenant_id=tenant.id,
        table_id=table.id,
        name="表格",
        type="grid",
        config_json={
            "hiddenFieldIds": [],
            "columnWidths": {
                "fld_name": 260,
                "fld_owner": 180,
                "fld_score": 120,
                "fld_due": 170,
                "fld_status": 180,
            },
            "sorts": [],
            "filters": [],
        },
    )

    fields = [
        FieldModel(id="fld_name", tenant_id=tenant.id, table_id=table.id, name="名称", type="text", width=260, sort_order=0),
        FieldModel(id="fld_owner", tenant_id=tenant.id, table_id=table.id, name="负责人", type="text", width=180, sort_order=1),
        FieldModel(id="fld_score", tenant_id=tenant.id, table_id=table.id, name="分数", type="number", width=120, sort_order=2),
        FieldModel(id="fld_due", tenant_id=tenant.id, table_id=table.id, name="截止日期", type="date", width=170, sort_order=3),
        FieldModel(
            id="fld_status",
            tenant_id=tenant.id,
            table_id=table.id,
            name="状态",
            type="singleSelect",
            width=180,
            sort_order=4,
            options_json=[
                {"id": "待处理", "name": "待处理", "color": "#9ca3af"},
                {"id": "进行中", "name": "进行中", "color": "#3b82f6"},
                {"id": "已完成", "name": "已完成", "color": "#10b981"},
            ],
        ),
    ]

    db.add(base)
    db.add(table)
    db.add(view)
    db.add_all(fields)

    owners = ["张明", "王芳", "李浩", "陈雪", "周杰", "林娜", "赵宇"]
    statuses = ["待处理", "进行中", "已完成"]

    records: list[RecordModel] = []
    values: list[RecordValueModel] = []

    for i in range(2000):
        idx = i + 1
        record_id = f"rec_{idx}"
        record = RecordModel(
            id=record_id,
            tenant_id=tenant.id,
            table_id=table.id,
            created_at=now_utc_naive(),
            updated_at=now_utc_naive(),
        )
        records.append(record)
        values.extend(
            [
                RecordValueModel(record_id=record_id, field_id="fld_name", value_json=f"任务 {idx}"),
                RecordValueModel(record_id=record_id, field_id="fld_owner", value_json=owners[i % len(owners)]),
                RecordValueModel(record_id=record_id, field_id="fld_score", value_json=((i * 7) % 100) + 1),
                RecordValueModel(
                    record_id=record_id,
                    field_id="fld_due",
                    value_json=f"2026-03-{str((i % 28) + 1).zfill(2)}",
                ),
                RecordValueModel(record_id=record_id, field_id="fld_status", value_json=statuses[i % len(statuses)]),
            ]
        )

    db.add_all(records)
    db.add_all(values)
    db.add(
        TablePermissionModel(
            tenant_id=tenant.id,
            table_id=table.id,
            user_id=owner.id,
            can_read=True,
            can_write=True,
            created_at=now_utc_naive(),
        )
    )
    db.add(
        ViewPermissionModel(
            tenant_id=tenant.id,
            view_id=view.id,
            user_id=owner.id,
            can_read=True,
            can_write=True,
            created_at=now_utc_naive(),
        )
    )
    db.commit()
    _ensure_project_management_defaults(db, tenant.id, owner.id)
    _backfill_missing_role_default_permissions(db, tenant.id)
