from __future__ import annotations

from typing import Any

BUILTIN_TENANT_ROLE_DEFAULTS: tuple[tuple[str, str, bool, bool, bool, bool], ...] = (
    ("member", "成员", False, False, True, False),
    ("admin", "管理员", True, True, True, True),
    ("project_manager", "项目经理", True, True, True, True),
    ("developer", "开发人员", False, False, True, True),
    ("implementer", "实施人员", False, False, True, True),
)

DEFAULT_VIEW_CONFIG: dict[str, Any] = {
    "hiddenFieldIds": [],
    "fieldOrderIds": [],
    "columnWidths": {},
    "sorts": [],
    "filters": [],
    "isEnabled": True,
    "order": 0,
    "filterLogic": "and",
    "filterPresets": [],
    "components": {},
}

DEFAULT_BUTTON_PERMISSIONS: dict[str, bool] = {
    "can_create_record": True,
    "can_delete_record": True,
    "can_import_records": True,
    "can_export_records": True,
    "can_manage_filters": True,
    "can_manage_sorts": True,
}
