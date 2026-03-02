from __future__ import annotations

import json
import os
import unittest
from uuid import uuid4

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-ci-0123456789abcd")
os.environ.setdefault("SEED_OWNER_PASSWORD", "owner-test-password-123")

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import hash_password
from app.db import db_context, ensure_schema_upgrades
from app.main import app
from app.models import (
    AuditLogModel,
    BaseModel,
    FieldModel,
    MembershipModel,
    RecordModel,
    TableModel,
    TenantModel,
    UserModel,
    ViewModel,
)
from app.services import now_utc_naive


class ApiSmokeTests(unittest.TestCase):
    def setUp(self) -> None:
        ensure_schema_upgrades()
        self.client = TestClient(app)
        self.owner_password = "owner-test-password-123"
        self._ensure_owner_password(self.owner_password)
        self.access_token = self._login_as_owner()
        self.headers = {"Authorization": f"Bearer {self.access_token}"}

    def tearDown(self) -> None:
        self.client.close()

    def _ensure_owner_password(self, password: str) -> None:
        with db_context() as db:
            owner = db.scalar(select(UserModel).where(UserModel.username == "owner"))
            self.assertIsNotNone(owner)
            owner.password_hash = hash_password(password)
            owner.must_change_password = False
            db.commit()

    def _login_as_owner(self) -> str:
        resp = self.client.post(
            "/auth/login",
            json={"username": "owner", "password": self.owner_password},
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        return payload["accessToken"]

    def _ensure_member_and_login(self) -> tuple[str, str]:
        username = f"member_{uuid4().hex[:6]}"
        user_id = f"usr_{uuid4().hex[:10]}"
        with db_context() as db:
            user = UserModel(
                id=user_id,
                username=username,
                account=username,
                password_hash=hash_password("member123456"),
                email=None,
                mobile=None,
                must_change_password=False,
                default_tenant_id="tenant_default",
                created_at=now_utc_naive(),
            )
            membership = MembershipModel(
                user_id=user_id,
                tenant_id="tenant_default",
                role="member",
                created_at=now_utc_naive(),
            )
            db.add_all([user, membership])
            db.commit()
        login_resp = self.client.post("/auth/login", json={"username": username, "password": "member123456"})
        self.assertEqual(login_resp.status_code, 200)
        token = login_resp.json()["accessToken"]
        return user_id, token

    def test_health(self) -> None:
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("status"), "ok")

    def test_unauthorized_protected_endpoint_returns_401(self) -> None:
        resp = self.client.get("/tables/tbl_1/views")
        self.assertEqual(resp.status_code, 401)

    def test_me_endpoint(self) -> None:
        resp = self.client.get("/auth/me", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["user"]["username"], "owner")
        self.assertTrue(body["currentTenant"]["id"])

    def test_create_form_view_and_list_views(self) -> None:
        view_name = f"表单回归-{uuid4().hex[:8]}"
        create_resp = self.client.post(
            "/tables/tbl_1/views",
            headers=self.headers,
            json={
                "name": view_name,
                "type": "form",
                "config": {
                    "hiddenFieldIds": [],
                    "columnWidths": {},
                    "sorts": [],
                    "filters": [],
                },
            },
        )
        self.assertEqual(create_resp.status_code, 200)
        created = create_resp.json()
        self.assertEqual(created.get("name"), view_name)
        self.assertEqual(created.get("type"), "form")
        self.assertTrue(str(created.get("id", "")).startswith("viw_"))

        list_resp = self.client.get("/tables/tbl_1/views", headers=self.headers)
        self.assertEqual(list_resp.status_code, 200)
        views = list_resp.json()
        self.assertTrue(any(view.get("id") == created.get("id") for view in views))

    def test_records_endpoint_still_works(self) -> None:
        resp = self.client.get(
            "/tables/tbl_1/records",
            headers=self.headers,
            params={"viewId": "viw_1", "cursor": "0", "pageSize": 5},
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(len(payload.get("items", [])), 5)

    def test_records_filter_param_works(self) -> None:
        fields_resp = self.client.get("/tables/tbl_1/fields", headers=self.headers)
        self.assertEqual(fields_resp.status_code, 200)
        fields = fields_resp.json()
        self.assertGreaterEqual(len(fields), 1)
        target_field = fields[0]

        keyword = f"过滤关键字-{uuid4().hex[:8]}"
        created = self.client.post(
            "/tables/tbl_1/records",
            headers=self.headers,
            json={"initialValues": {target_field["id"]: keyword}},
        )
        self.assertEqual(created.status_code, 200)

        resp = self.client.get(
            "/tables/tbl_1/records",
            headers=self.headers,
            params={
                "viewId": "viw_1",
                "pageSize": 20,
                "filters": json.dumps([{"fieldId": target_field["id"], "op": "contains", "value": keyword}]),
            },
        )
        self.assertEqual(resp.status_code, 200)
        items = resp.json().get("items", [])
        self.assertGreaterEqual(len(items), 1)
        self.assertTrue(any(item.get("values", {}).get(target_field["id"]) == keyword for item in items))

    def test_cross_tenant_access_denied_and_logged(self) -> None:
        other_table_id = f"tbl_other_{uuid4().hex[:6]}"
        with db_context() as db:
            tenant = db.scalar(select(TenantModel).where(TenantModel.id == "tenant_other"))
            if not tenant:
                tenant = TenantModel(id="tenant_other", name="其他租户")
                db.add(tenant)
                db.commit()
            base = BaseModel(id=f"base_other_{uuid4().hex[:6]}", tenant_id=tenant.id, name="其他基地")
            table = TableModel(id=other_table_id, tenant_id=tenant.id, base_id=base.id, name="其他表")
            field = FieldModel(
                id=f"fld_other_{uuid4().hex[:6]}",
                tenant_id=tenant.id,
                table_id=table.id,
                name="标题",
                type="text",
                width=180,
                sort_order=0,
            )
            view = ViewModel(
                id=f"viw_other_{uuid4().hex[:6]}",
                tenant_id=tenant.id,
                table_id=table.id,
                name="其他视图",
                type="grid",
                config_json={"hiddenFieldIds": [], "columnWidths": {}, "sorts": [], "filters": []},
            )
            record = RecordModel(
                id=f"rec_other_{uuid4().hex[:6]}",
                tenant_id=tenant.id,
                table_id=table.id,
                created_at=now_utc_naive(),
                updated_at=now_utc_naive(),
            )
            db.add_all([base, table, field, view, record])
            db.commit()

        denied = self.client.get(f"/tables/{other_table_id}/fields", headers=self.headers)
        self.assertIn(denied.status_code, (403, 404))

        with db_context() as db:
            log = db.scalar(
                select(AuditLogModel)
                .where(
                    AuditLogModel.action == "cross_tenant_access",
                    AuditLogModel.resource_type == "table",
                    AuditLogModel.resource_id == other_table_id,
                )
                .order_by(AuditLogModel.id.desc())
            )
            self.assertIsNotNone(log)

    def test_cross_tenant_update_denied_and_logged(self) -> None:
        other_record_id = f"rec_other_{uuid4().hex[:6]}"
        with db_context() as db:
            tenant = db.scalar(select(TenantModel).where(TenantModel.id == "tenant_other_for_update"))
            if not tenant:
                tenant = TenantModel(id="tenant_other_for_update", name="其他租户-更新")
                db.add(tenant)
                db.commit()
            base = BaseModel(id=f"base_other_{uuid4().hex[:6]}", tenant_id=tenant.id, name="其他基地")
            table = TableModel(id=f"tbl_other_{uuid4().hex[:6]}", tenant_id=tenant.id, base_id=base.id, name="其他表")
            field = FieldModel(
                id=f"fld_other_{uuid4().hex[:6]}",
                tenant_id=tenant.id,
                table_id=table.id,
                name="标题",
                type="text",
                width=180,
                sort_order=0,
            )
            record = RecordModel(
                id=other_record_id,
                tenant_id=tenant.id,
                table_id=table.id,
                created_at=now_utc_naive(),
                updated_at=now_utc_naive(),
            )
            db.add_all([base, table, field, record])
            db.commit()

        denied = self.client.patch(
            f"/records/{other_record_id}",
            headers=self.headers,
            json={"valuesPatch": {"fld_name": "越权更新"}},
        )
        self.assertIn(denied.status_code, (403, 404))

        with db_context() as db:
            log = db.scalar(
                select(AuditLogModel)
                .where(
                    AuditLogModel.action == "cross_tenant_access",
                    AuditLogModel.resource_type == "record",
                    AuditLogModel.resource_id == other_record_id,
                )
                .order_by(AuditLogModel.id.desc())
            )
            self.assertIsNotNone(log)

    def test_member_management_owner_can_remove_member(self) -> None:
        member_user_id, _ = self._ensure_member_and_login()
        before = self.client.get("/tenants/current/members", headers=self.headers)
        self.assertEqual(before.status_code, 200)
        self.assertTrue(any(item["userId"] == member_user_id for item in before.json()))

        remove_resp = self.client.delete(f"/tenants/current/members/{member_user_id}", headers=self.headers)
        self.assertEqual(remove_resp.status_code, 200)

        after = self.client.get("/tenants/current/members", headers=self.headers)
        self.assertEqual(after.status_code, 200)
        self.assertFalse(any(item["userId"] == member_user_id for item in after.json()))

    def test_member_management_owner_can_create_member(self) -> None:
        username = f"new_member_{uuid4().hex[:6]}"
        account = f"acc_{uuid4().hex[:6]}"
        create_resp = self.client.post(
            "/tenants/current/members",
            headers=self.headers,
            json={"username": username, "account": account, "password": "member123456"},
        )
        self.assertEqual(create_resp.status_code, 200)
        created = create_resp.json()
        self.assertEqual(created["username"], username)
        self.assertEqual(created["role"], "member")

        login = self.client.post("/auth/login", json={"username": account, "password": "member123456"})
        self.assertEqual(login.status_code, 200)

    def test_member_default_password_requires_first_login_change(self) -> None:
        username = f"new_member_{uuid4().hex[:6]}"
        account = f"acc_{uuid4().hex[:6]}"
        create_resp = self.client.post(
            "/tenants/current/members",
            headers=self.headers,
            json={"username": username, "account": account},
        )
        self.assertEqual(create_resp.status_code, 200)
        temporary_password = create_resp.json().get("temporaryPassword")
        self.assertTrue(temporary_password)

        blocked = self.client.post("/auth/login", json={"username": account, "password": temporary_password})
        self.assertEqual(blocked.status_code, 403)

        changed = self.client.post(
            "/auth/first-login/change-password",
            json={"account": account, "password": temporary_password, "newPassword": "member123456"},
        )
        self.assertEqual(changed.status_code, 200)

        login = self.client.post("/auth/login", json={"username": account, "password": "member123456"})
        self.assertEqual(login.status_code, 200)

    def test_member_management_member_cannot_access_owner_endpoint(self) -> None:
        _, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}
        list_resp = self.client.get("/tenants/current/members", headers=member_headers)
        self.assertEqual(list_resp.status_code, 403)

    def test_table_permissions_control_member_access(self) -> None:
        member_user_id, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}

        denied_read = self.client.get("/tables/tbl_1/views", headers=member_headers)
        self.assertEqual(denied_read.status_code, 403)

        grant = self.client.put(
            "/tables/tbl_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": True, "canWrite": False}]},
        )
        self.assertEqual(grant.status_code, 200)

        allowed_read = self.client.get("/tables/tbl_1/views", headers=member_headers)
        self.assertEqual(allowed_read.status_code, 200)

        denied_write = self.client.post(
            "/tables/tbl_1/records",
            headers=member_headers,
            json={"initialValues": {"fld_name": "member cannot write"}},
        )
        self.assertEqual(denied_write.status_code, 403)

    def test_member_field_requires_table_reference_permission(self) -> None:
        permitted = self.client.post(
            "/tenants/current/members",
            headers=self.headers,
            json={"username": f"permit_{uuid4().hex[:6]}", "password": "member123456"},
        )
        blocked = self.client.post(
            "/tenants/current/members",
            headers=self.headers,
            json={"username": f"blocked_{uuid4().hex[:6]}", "password": "member123456"},
        )
        self.assertEqual(permitted.status_code, 200)
        self.assertEqual(blocked.status_code, 200)
        permitted_user_id = permitted.json()["userId"]
        blocked_user_id = blocked.json()["userId"]

        permissions = self.client.put(
            "/tables/tbl_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": permitted_user_id, "canRead": True, "canWrite": True}]},
        )
        self.assertEqual(permissions.status_code, 200)

        field_resp = self.client.post(
            "/tables/tbl_1/fields",
            headers=self.headers,
            json={"name": f"负责人引用_{uuid4().hex[:4]}", "type": "member", "width": 180},
        )
        self.assertEqual(field_resp.status_code, 200)
        member_field_id = field_resp.json()["id"]

        ok = self.client.post(
            "/tables/tbl_1/records",
            headers=self.headers,
            json={"initialValues": {member_field_id: permitted_user_id}},
        )
        self.assertEqual(ok.status_code, 200)

        bad = self.client.post(
            "/tables/tbl_1/records",
            headers=self.headers,
            json={"initialValues": {member_field_id: blocked_user_id}},
        )
        self.assertEqual(bad.status_code, 400)

    def test_view_permissions_control_member_access(self) -> None:
        member_user_id, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}

        grant = self.client.put(
            "/tables/tbl_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": True, "canWrite": True}]},
        )
        self.assertEqual(grant.status_code, 200)

        denied_before = self.client.get(
            "/tables/tbl_1/records",
            headers=member_headers,
            params={"viewId": "viw_1", "pageSize": 5},
        )
        self.assertEqual(denied_before.status_code, 403)
        with db_context() as db:
            log = db.scalar(
                select(AuditLogModel)
                .where(
                    AuditLogModel.action == "view_permission_denied",
                    AuditLogModel.resource_type == "view",
                    AuditLogModel.resource_id == "viw_1",
                )
                .order_by(AuditLogModel.id.desc())
            )
            self.assertIsNotNone(log)

        allow_view = self.client.put(
            "/views/viw_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": True, "canWrite": False}]},
        )
        self.assertEqual(allow_view.status_code, 200)

        allowed_after = self.client.get(
            "/tables/tbl_1/records",
            headers=member_headers,
            params={"viewId": "viw_1", "pageSize": 5},
        )
        self.assertEqual(allowed_after.status_code, 200)

        lock_view = self.client.put(
            "/views/viw_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": False, "canWrite": False}]},
        )
        self.assertEqual(lock_view.status_code, 200)

        denied = self.client.get(
            "/tables/tbl_1/records",
            headers=member_headers,
            params={"viewId": "viw_1", "pageSize": 5},
        )
        self.assertEqual(denied.status_code, 403)
        with db_context() as db:
            log = db.scalar(
                select(AuditLogModel)
                .where(
                    AuditLogModel.action == "view_permission_denied",
                    AuditLogModel.resource_type == "view",
                    AuditLogModel.resource_id == "viw_1",
                )
                .order_by(AuditLogModel.id.desc())
            )
            self.assertIsNotNone(log)

    def test_non_owner_cannot_manage_roles(self) -> None:
        _, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}
        create_role = self.client.post(
            "/tenants/current/roles",
            headers=member_headers,
            json={
                "key": f"qa_{uuid4().hex[:6]}",
                "name": "测试角色",
                "canManageMembers": False,
                "canManagePermissions": False,
                "defaultTableCanRead": True,
                "defaultTableCanWrite": False,
            },
        )
        self.assertEqual(create_role.status_code, 403)

    def test_non_owner_cannot_remove_owner(self) -> None:
        username = f"manager_{uuid4().hex[:6]}"
        user_id = f"usr_{uuid4().hex[:10]}"
        with db_context() as db:
            user = UserModel(
                id=user_id,
                username=username,
                account=username,
                password_hash=hash_password("member123456"),
                email=None,
                mobile=None,
                must_change_password=False,
                default_tenant_id="tenant_default",
                created_at=now_utc_naive(),
            )
            membership = MembershipModel(
                user_id=user_id,
                tenant_id="tenant_default",
                role="member",
                role_key="admin",
                created_at=now_utc_naive(),
            )
            db.add_all([user, membership])
            db.commit()
        login_resp = self.client.post("/auth/login", json={"username": username, "password": "member123456"})
        self.assertEqual(login_resp.status_code, 200)
        manager_headers = {"Authorization": f"Bearer {login_resp.json()['accessToken']}"}

        denied = self.client.delete("/tenants/current/members/usr_owner", headers=manager_headers)
        self.assertEqual(denied.status_code, 403)

    def test_non_owner_query_records_without_view_id_returns_400(self) -> None:
        member_user_id, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}

        grant_table = self.client.put(
            "/tables/tbl_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": True, "canWrite": False}]},
        )
        self.assertEqual(grant_table.status_code, 200)

        query_without_view = self.client.get(
            "/tables/tbl_1/records",
            headers=member_headers,
            params={"pageSize": 5},
        )
        self.assertEqual(query_without_view.status_code, 400)

    def test_import_view_bundle_creates_view_and_records(self) -> None:
        payload = {
            "viewName": f"导入视图-{uuid4().hex[:6]}",
            "viewType": "grid",
            "fields": [
                {"name": "任务名称", "type": "text", "width": 180},
                {"name": "优先级", "type": "singleSelect", "options": [{"id": "高", "name": "高"}, {"id": "低", "name": "低"}]},
            ],
            "records": [
                {"任务名称": "A", "优先级": "高"},
                {"任务名称": "B", "优先级": "低"},
            ],
        }
        resp = self.client.post("/tables/tbl_1/views/import", headers=self.headers, json=payload)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(str(body.get("viewId", "")).startswith("viw_"))
        self.assertEqual(body.get("recordCount"), 2)
        self.assertEqual(len(body.get("fieldIds", [])), 2)

    def test_import_view_bundle_legacy_route_supports_table_id_in_body(self) -> None:
        payload = {
            "tableId": "tbl_1",
            "viewName": f"导入视图兼容-{uuid4().hex[:6]}",
            "viewType": "grid",
            "fields": [{"name": "名称", "type": "text", "width": 180}],
            "records": [{"名称": "A"}],
        }
        resp = self.client.post("/views/import", headers=self.headers, json=payload)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(str(body.get("viewId", "")).startswith("viw_"))
        self.assertEqual(body.get("recordCount"), 1)
        self.assertEqual(len(body.get("fieldIds", [])), 1)

    def test_button_permissions_can_disable_member_create_delete(self) -> None:
        member_user_id, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}

        grant = self.client.put(
            "/tables/tbl_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": True, "canWrite": True}]},
        )
        self.assertEqual(grant.status_code, 200)

        update_buttons = self.client.put(
            "/tables/tbl_1/button-permissions",
            headers=self.headers,
            json={
                "items": [
                    {
                        "userId": member_user_id,
                        "buttons": {
                            "canCreateRecord": False,
                            "canDeleteRecord": False,
                            "canImportRecords": True,
                            "canExportRecords": True,
                            "canManageFilters": True,
                            "canManageSorts": True,
                        },
                    }
                ]
            },
        )
        self.assertEqual(update_buttons.status_code, 200)

        create_denied = self.client.post(
            "/tables/tbl_1/records",
            headers=member_headers,
            json={"initialValues": {"fld_name": "should fail"}},
        )
        self.assertEqual(create_denied.status_code, 403)

        owner_created = self.client.post(
            "/tables/tbl_1/records",
            headers=self.headers,
            json={"initialValues": {}},
        )
        self.assertEqual(owner_created.status_code, 200)
        record_id = owner_created.json()["id"]

        delete_denied = self.client.delete(f"/records/{record_id}", headers=member_headers)
        self.assertEqual(delete_denied.status_code, 403)

    def test_button_permissions_can_disable_member_import_view_bundle(self) -> None:
        member_user_id, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}

        grant = self.client.put(
            "/tables/tbl_1/permissions",
            headers=self.headers,
            json={"items": [{"userId": member_user_id, "canRead": True, "canWrite": True}]},
        )
        self.assertEqual(grant.status_code, 200)

        update_buttons = self.client.put(
            "/tables/tbl_1/button-permissions",
            headers=self.headers,
            json={
                "items": [
                    {
                        "userId": member_user_id,
                        "buttons": {
                            "canCreateRecord": True,
                            "canDeleteRecord": True,
                            "canImportRecords": False,
                            "canExportRecords": True,
                            "canManageFilters": True,
                            "canManageSorts": True,
                        },
                    }
                ]
            },
        )
        self.assertEqual(update_buttons.status_code, 200)

        denied = self.client.post(
            "/tables/tbl_1/views/import",
            headers=member_headers,
            json={
                "viewName": f"成员导入-{uuid4().hex[:6]}",
                "viewType": "grid",
                "fields": [{"name": "名称", "type": "text", "width": 180}],
                "records": [{"名称": "A"}],
            },
        )
        self.assertEqual(denied.status_code, 403)

    def test_dashboard_widget_crud_and_data_for_owner(self) -> None:
        current = self.client.get("/dashboards/current", headers=self.headers)
        self.assertEqual(current.status_code, 200)
        dashboard = current.json()
        self.assertTrue(dashboard.get("id"))

        created = self.client.post(
            "/dashboards/widgets",
            headers=self.headers,
            json={
                "type": "metric",
                "title": f"指标卡-{uuid4().hex[:6]}",
                "tableId": "tbl_1",
                "fieldIds": [],
                "aggregation": "count",
                "groupFieldId": None,
                "layout": {"x": 0, "y": 0, "w": 4, "h": 3},
                "config": {},
            },
        )
        self.assertEqual(created.status_code, 200)
        widget = created.json()
        widget_id = widget["id"]
        self.assertEqual(widget["type"], "metric")
        self.assertEqual(widget["tableId"], "tbl_1")

        data = self.client.post(
            f"/dashboards/widgets/{widget_id}/data",
            headers=self.headers,
            json={},
        )
        self.assertEqual(data.status_code, 200)
        body = data.json()
        self.assertEqual(body["type"], "metric")
        self.assertIsInstance(body["data"]["value"], int)

        updated = self.client.patch(
            f"/dashboards/widgets/{widget_id}",
            headers=self.headers,
            json={
                "title": "更新后的指标卡",
                "layout": {"x": 2, "y": 1, "w": 6, "h": 3},
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["title"], "更新后的指标卡")
        self.assertEqual(updated.json()["layout"]["x"], 2)

        deleted = self.client.delete(f"/dashboards/widgets/{widget_id}", headers=self.headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["ok"])

    def test_dashboard_tables_list_for_owner(self) -> None:
        listed = self.client.get("/dashboards/tables", headers=self.headers)
        self.assertEqual(listed.status_code, 200)
        payload = listed.json()
        self.assertTrue(any(item["id"] == "tbl_1" for item in payload))
        self.assertTrue(any(item["id"] == "tbl_work_orders" for item in payload))

    def test_dashboard_widget_data_maps_single_select_labels_and_table_field_names(self) -> None:
        field_resp = self.client.post(
            "/tables/tbl_1/fields",
            headers=self.headers,
            json={
                "name": "测试状态映射",
                "type": "singleSelect",
                "options": [
                    {"id": "opt_wait", "name": "待处理", "color": "#9ca3af"},
                    {"id": "opt_done", "name": "已完成", "color": "#10b981"},
                ],
            },
        )
        self.assertEqual(field_resp.status_code, 200)
        group_field_id = field_resp.json()["id"]

        create_record = self.client.post(
            "/tables/tbl_1/records",
            headers=self.headers,
            json={"initialValues": {group_field_id: "opt_wait", "fld_name": "状态映射验证"}},
        )
        self.assertEqual(create_record.status_code, 200)

        grouped_widget = self.client.post(
            "/dashboards/widgets",
            headers=self.headers,
            json={
                "type": "bar",
                "title": f"状态分组-{uuid4().hex[:6]}",
                "tableId": "tbl_1",
                "fieldIds": [],
                "aggregation": "count",
                "groupFieldId": group_field_id,
                "layout": {"x": 0, "y": 0, "w": 4, "h": 3},
                "config": {},
            },
        )
        self.assertEqual(grouped_widget.status_code, 200)
        grouped_widget_id = grouped_widget.json()["id"]

        grouped_data = self.client.post(
            f"/dashboards/widgets/{grouped_widget_id}/data",
            headers=self.headers,
            json={},
        )
        self.assertEqual(grouped_data.status_code, 200)
        group_names = {item["name"] for item in grouped_data.json()["data"]}
        self.assertIn("待处理", group_names)
        self.assertNotIn("opt_wait", group_names)

        table_widget = self.client.post(
            "/dashboards/widgets",
            headers=self.headers,
            json={
                "type": "table",
                "title": f"列表字段名-{uuid4().hex[:6]}",
                "tableId": "tbl_1",
                "fieldIds": ["fld_name"],
                "aggregation": "count",
                "groupFieldId": None,
                "layout": {"x": 0, "y": 0, "w": 4, "h": 3},
                "config": {},
            },
        )
        self.assertEqual(table_widget.status_code, 200)
        table_widget_id = table_widget.json()["id"]

        table_data = self.client.post(
            f"/dashboards/widgets/{table_widget_id}/data",
            headers=self.headers,
            json={},
        )
        self.assertEqual(table_data.status_code, 200)
        self.assertEqual(table_data.json().get("fieldNameMap", {}).get("fld_name"), "名称")

        delete_grouped = self.client.delete(f"/dashboards/widgets/{grouped_widget_id}", headers=self.headers)
        self.assertEqual(delete_grouped.status_code, 200)
        delete_table = self.client.delete(f"/dashboards/widgets/{table_widget_id}", headers=self.headers)
        self.assertEqual(delete_table.status_code, 200)

    def test_dashboard_widget_date_bucket_respects_widget_config(self) -> None:
        created = self.client.post(
            "/dashboards/widgets",
            headers=self.headers,
            json={
                "type": "line",
                "title": f"日期粒度-{uuid4().hex[:6]}",
                "tableId": "tbl_1",
                "fieldIds": [],
                "aggregation": "count",
                "groupFieldId": "fld_due",
                "layout": {"x": 0, "y": 0, "w": 4, "h": 3},
                "config": {"dateBucket": "month"},
            },
        )
        self.assertEqual(created.status_code, 200)
        widget_id = created.json()["id"]

        month_data_resp = self.client.post(
            f"/dashboards/widgets/{widget_id}/data",
            headers=self.headers,
            json={},
        )
        self.assertEqual(month_data_resp.status_code, 200)
        month_data = month_data_resp.json()["data"]
        self.assertEqual(len(month_data), 1)
        self.assertEqual(month_data[0]["date"], "2026-03")

        update_widget = self.client.patch(
            f"/dashboards/widgets/{widget_id}",
            headers=self.headers,
            json={"config": {"dateBucket": "day"}},
        )
        self.assertEqual(update_widget.status_code, 200)

        day_data_resp = self.client.post(
            f"/dashboards/widgets/{widget_id}/data",
            headers=self.headers,
            json={},
        )
        self.assertEqual(day_data_resp.status_code, 200)
        day_data = day_data_resp.json()["data"]
        self.assertGreaterEqual(len(day_data), 20)
        self.assertTrue(any(item["date"] == "2026-03-01" for item in day_data))

        deleted = self.client.delete(f"/dashboards/widgets/{widget_id}", headers=self.headers)
        self.assertEqual(deleted.status_code, 200)

    def test_member_cannot_manage_dashboard_widgets(self) -> None:
        _, member_token = self._ensure_member_and_login()
        member_headers = {"Authorization": f"Bearer {member_token}"}

        readable = self.client.get("/dashboards/current", headers=member_headers)
        self.assertEqual(readable.status_code, 200)

        denied_create = self.client.post(
            "/dashboards/widgets",
            headers=member_headers,
            json={
                "type": "metric",
                "title": "成员尝试创建",
                "tableId": "tbl_1",
                "fieldIds": [],
                "aggregation": "count",
                "layout": {"x": 0, "y": 0, "w": 4, "h": 3},
                "config": {},
            },
        )
        self.assertEqual(denied_create.status_code, 403)

        denied_tables = self.client.get("/dashboards/tables", headers=member_headers)
        self.assertEqual(denied_tables.status_code, 403)


if __name__ == "__main__":
    unittest.main()
