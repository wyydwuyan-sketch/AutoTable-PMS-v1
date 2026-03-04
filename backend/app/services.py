from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from .models import FieldModel, RecordModel, RecordValueModel
from .schemas import FieldOut, RecordOut, ViewConfig, ViewOut


def to_field_out(field: FieldModel) -> FieldOut:
    return FieldOut(
        id=field.id,
        tableId=field.table_id,
        name=field.name,
        type=field.type,  # type: ignore[arg-type]
        width=field.width,
        options=field.options_json,
    )


def to_view_out(view) -> ViewOut:
    return ViewOut(
        id=view.id,
        tableId=view.table_id,
        name=view.name,
        type=view.type,  # type: ignore[arg-type]
        config=ViewConfig.model_validate(view.config_json),
    )


def serialize_record(record: RecordModel) -> RecordOut:
    values = {item.field_id: item.value_json for item in record.values}
    return RecordOut(id=record.id, tableId=record.table_id, version=int(record.version or 0), values=values)


def now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def validate_value(field: FieldModel, value: Any, allowed_member_ids: set[str] | None = None) -> Any:
    if value is None:
        return None

    if field.type == "text":
        if not isinstance(value, str):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要字符串")
        return value

    if field.type == "number":
        if isinstance(value, (int, float)):
            return value
        raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要数字")

    if field.type == "date":
        if not isinstance(value, str):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要日期字符串")
        try:
            if "T" in value:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            else:
                date.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 日期格式非法") from exc
        return value

    if field.type == "singleSelect":
        if not isinstance(value, str):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要单选字符串值")
        options = {item.get("id") for item in (field.options_json or [])}
        if not options:
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 未配置可用选项")
        if value not in options:
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 选项不存在")
        return value

    if field.type == "multiSelect":
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要字符串数组")
        options = {item.get("id") for item in (field.options_json or [])}
        if not options:
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 未配置可用选项")
        if any(item not in options for item in value):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 存在非法选项")
        return value

    if field.type == "checkbox":
        if not isinstance(value, bool):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要布尔值")
        return value

    if field.type in {"attachment", "image"}:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要文件 URL 数组")
        if field.type == "image":
            if any((not item.strip()) for item in value):
                raise HTTPException(status_code=400, detail=f"字段 {field.name} 图片值不能为空")
        return value

    if field.type == "member":
        if not isinstance(value, str):
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 需要成员ID字符串")
        if allowed_member_ids is None:
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 缺少可引用成员范围")
        if value not in allowed_member_ids:
            raise HTTPException(status_code=400, detail=f"字段 {field.name} 成员不在该表可引用范围内")
        return value

    raise HTTPException(status_code=400, detail=f"不支持的字段类型 {field.type}")


def upsert_record_values(
    db: Session,
    record: RecordModel,
    fields_by_id: dict[str, FieldModel],
    patch: dict[str, Any],
    allowed_member_ids: set[str] | None = None,
) -> None:
    if not patch:
        return

    for field_id, raw_value in patch.items():
        field = fields_by_id.get(field_id)
        if not field:
            raise HTTPException(status_code=404, detail=f"字段不存在: {field_id}")
        value = validate_value(field, raw_value, allowed_member_ids)
        existing = db.scalar(
            select(RecordValueModel).where(
                and_(RecordValueModel.record_id == record.id, RecordValueModel.field_id == field_id)
            )
        )
        if existing:
            existing.value_json = value
        else:
            db.add(RecordValueModel(record_id=record.id, field_id=field_id, value_json=value))

    record.updated_at = now_utc_naive()


def _record_value_by_field(record: RecordModel, field_id: str) -> Any:
    for item in record.values:
        if item.field_id == field_id:
            return item.value_json
    return None


def _normalize_sort_value(field: FieldModel | None, value: Any) -> Any:
    if value is None:
        return None
    if not field:
        return str(value).lower()
    if field.type == "number":
        return value if isinstance(value, (int, float)) else None
    if field.type == "date":
        if isinstance(value, str):
            try:
                if "T" in value:
                    return datetime.fromisoformat(value.replace("Z", "+00:00"))
                return date.fromisoformat(value)
            except ValueError:
                return value
    return str(value).lower()


def _match_filter(field: FieldModel | None, value: Any, item: dict[str, Any]) -> bool:
    op = str(item.get("op", "contains")).lower()
    expected = item.get("value")

    if op in {"contains"}:
        return str(expected or "").lower() in str(value or "").lower()
    if op in {"eq", "equals"}:
        return value == expected
    if op == "neq":
        return value != expected
    if op == "in":
        if not isinstance(expected, list):
            return False
        return value in expected
    if op == "nin":
        if not isinstance(expected, list):
            return True
        return value not in expected
    if op == "empty":
        return value in (None, "", [], {})
    if op == "not_empty":
        return value not in (None, "", [], {})
    if op == "gt":
        if field and field.type == "date" and isinstance(value, str) and isinstance(expected, str):
            return value > expected
        return isinstance(value, (int, float)) and isinstance(expected, (int, float)) and value > expected
    if op == "gte":
        if field and field.type == "date" and isinstance(value, str) and isinstance(expected, str):
            return value >= expected
        return isinstance(value, (int, float)) and isinstance(expected, (int, float)) and value >= expected
    if op == "lt":
        if field and field.type == "date" and isinstance(value, str) and isinstance(expected, str):
            return value < expected
        return isinstance(value, (int, float)) and isinstance(expected, (int, float)) and value < expected
    if op == "lte":
        if field and field.type == "date" and isinstance(value, str) and isinstance(expected, str):
            return value <= expected
        return isinstance(value, (int, float)) and isinstance(expected, (int, float)) and value <= expected

    if field and field.type == "singleSelect":
        return value == expected
    return str(expected or "").lower() in str(value or "").lower()


def apply_filters_and_sorts(
    records: list[RecordModel],
    fields_by_id: dict[str, FieldModel],
    filters: list[dict[str, Any]],
    sorts: list[dict[str, Any]],
    filter_logic: str = "and",
) -> list[RecordModel]:
    filtered = records
    valid_filters = [item for item in filters if isinstance(item.get("fieldId"), str) and item.get("fieldId")]
    if valid_filters:
        if filter_logic == "or":
            filtered = []
            for record in records:
                for filter_item in valid_filters:
                    field_id = str(filter_item.get("fieldId"))
                    field = fields_by_id.get(field_id)
                    if _match_filter(field, _record_value_by_field(record, field_id), filter_item):
                        filtered.append(record)
                        break
        else:
            for filter_item in valid_filters:
                field_id = str(filter_item.get("fieldId"))
                field = fields_by_id.get(field_id)
                filtered = [
                    record
                    for record in filtered
                    if _match_filter(field, _record_value_by_field(record, field_id), filter_item)
                ]

    sorted_records = filtered
    for sort_item in reversed(sorts):
        field_id = sort_item.get("fieldId")
        if not isinstance(field_id, str) or not field_id:
            continue
        direction = str(sort_item.get("direction", "asc")).lower()
        field = fields_by_id.get(field_id)
        reverse = direction == "desc"
        non_null_records = [
            record for record in sorted_records if _record_value_by_field(record, field_id) is not None
        ]
        null_records = [record for record in sorted_records if _record_value_by_field(record, field_id) is None]
        non_null_records = sorted(
            non_null_records,
            key=lambda record: _normalize_sort_value(field, _record_value_by_field(record, field_id)),
            reverse=reverse,
        )
        sorted_records = non_null_records + null_records

    return sorted_records
