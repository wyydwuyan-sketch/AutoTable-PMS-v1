from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, joinedload

from .models import DashboardWidgetModel, FieldModel, RecordModel, RecordValueModel
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


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _coerce_date_bucket(raw_value: str | None) -> str:
    allowed = {"day", "week", "month", "quarter", "year"}
    if raw_value and raw_value in allowed:
        return raw_value
    return "month"


def _bucket_date_group_value(value: Any, bucket: str) -> str:
    if isinstance(value, datetime):
        parsed_date = value.date()
    elif isinstance(value, date):
        parsed_date = value
    elif isinstance(value, str):
        try:
            if "T" in value:
                parsed_date = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
            else:
                parsed_date = date.fromisoformat(value)
        except ValueError:
            return value
    else:
        return str(value)

    if bucket == "day":
        return parsed_date.isoformat()
    if bucket == "week":
        iso_year, iso_week, _ = parsed_date.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    if bucket == "quarter":
        quarter = ((parsed_date.month - 1) // 3) + 1
        return f"{parsed_date.year}-Q{quarter}"
    if bucket == "year":
        return str(parsed_date.year)
    return f"{parsed_date.year}-{parsed_date.month:02d}"


def aggregate_widget_data(
    db: Session,
    widget: DashboardWidgetModel,
    *,
    override_aggregation: str | None = None,
    override_group_field_id: str | None = None,
    override_date_bucket: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    widget_type = widget.type
    table_id = widget.table_id
    tenant_id = widget.tenant_id
    field_ids = widget.field_ids_json or []
    aggregation = override_aggregation or widget.aggregation or "count"
    group_field_id = override_group_field_id or widget.group_field_id
    config = widget.config_json or {}
    date_bucket = _coerce_date_bucket(override_date_bucket or str(config.get("dateBucket") or ""))

    if not table_id:
        return {"type": widget_type, "data": None, "error": "未绑定数据表"}

    if widget_type == "metric":
        if aggregation == "count":
            count = db.scalar(
                select(func.count(RecordModel.id)).where(
                    RecordModel.tenant_id == tenant_id,
                    RecordModel.table_id == table_id,
                )
            )
            return {
                "type": "metric",
                "data": {"value": int(count or 0), "label": "总记录数"},
            }
        if not field_ids:
            return {"type": "metric", "data": None, "error": "请选择数字字段"}
        field_id = field_ids[0]
        values = db.scalars(
            select(RecordValueModel.value_json)
            .join(RecordModel, RecordModel.id == RecordValueModel.record_id)
            .where(
                RecordModel.tenant_id == tenant_id,
                RecordModel.table_id == table_id,
                RecordValueModel.field_id == field_id,
            )
        ).all()
        numbers = [item for item in (_to_float(value) for value in values) if item is not None]
        if aggregation == "sum":
            result = sum(numbers)
            label = "合计"
        else:
            result = (sum(numbers) / len(numbers)) if numbers else 0
            label = "平均值"
        return {"type": "metric", "data": {"value": round(result, 2), "label": label}}

    if widget_type in {"bar", "pie", "line"}:
        if not group_field_id:
            return {"type": widget_type, "data": [], "error": "请选择分组字段"}
        group_field = db.scalar(
            select(FieldModel).where(
                FieldModel.id == group_field_id,
                FieldModel.tenant_id == tenant_id,
                FieldModel.table_id == table_id,
            )
        )
        option_id_to_name: dict[str, str] = {}
        if group_field and group_field.type == "singleSelect":
            option_id_to_name = {
                str(item.get("id")): str(item.get("name"))
                for item in (group_field.options_json or [])
                if isinstance(item, dict) and item.get("id")
            }
        group_rows = db.execute(
            select(RecordModel.id, RecordValueModel.value_json)
            .join(RecordValueModel, RecordValueModel.record_id == RecordModel.id)
            .where(
                RecordModel.tenant_id == tenant_id,
                RecordModel.table_id == table_id,
                RecordValueModel.field_id == group_field_id,
            )
        ).all()

        value_map: dict[str, list[float]] = {}
        use_value_field = aggregation in {"sum", "avg"} and len(field_ids) > 0
        value_field_id = field_ids[0] if use_value_field else None
        numeric_by_record: dict[str, float | None] = {}
        if value_field_id:
            value_rows = db.execute(
                select(RecordValueModel.record_id, RecordValueModel.value_json).where(
                    RecordValueModel.field_id == value_field_id
                )
            ).all()
            numeric_by_record = {record_id: _to_float(raw) for record_id, raw in value_rows}

        for record_id, group_value in group_rows:
            if group_value in (None, ""):
                key = "(空)"
            elif group_field and group_field.type == "singleSelect":
                raw_key = str(group_value)
                key = option_id_to_name.get(raw_key, raw_key)
            elif group_field and group_field.type == "date":
                key = _bucket_date_group_value(group_value, date_bucket)
            else:
                key = str(group_value)
            if key not in value_map:
                value_map[key] = []
            if value_field_id:
                numeric = numeric_by_record.get(record_id)
                if numeric is not None:
                    value_map[key].append(numeric)
            else:
                value_map[key].append(1.0)

        data: list[dict[str, Any]] = []
        for key, values in value_map.items():
            if aggregation == "sum":
                computed = sum(values)
            elif aggregation == "avg":
                computed = (sum(values) / len(values)) if values else 0
            else:
                computed = float(len(values))
            if widget_type == "line":
                data.append({"date": key, "value": round(computed, 2)})
            else:
                data.append({"name": key, "value": round(computed, 2)})

        if widget_type == "line":
            data.sort(key=lambda item: str(item["date"]))
        else:
            data.sort(key=lambda item: str(item["name"]))
        return {"type": widget_type, "data": data}

    if widget_type == "table":
        records = db.scalars(
            select(RecordModel)
            .where(
                RecordModel.tenant_id == tenant_id,
                RecordModel.table_id == table_id,
            )
            .order_by(RecordModel.created_at.desc())
            .limit(max(1, min(limit, 500)))
            .options(joinedload(RecordModel.values))
        ).unique().all()
        rows: list[dict[str, Any]] = []
        for record in records:
            row: dict[str, Any] = {"id": record.id}
            for item in record.values:
                if field_ids and item.field_id not in field_ids:
                    continue
                row[item.field_id] = item.value_json
            rows.append(row)
        field_name_rows = db.execute(
            select(FieldModel.id, FieldModel.name).where(
                FieldModel.tenant_id == tenant_id,
                FieldModel.table_id == table_id,
            )
        ).all()
        field_name_map = {field_id: field_name for field_id, field_name in field_name_rows}
        if field_ids:
            field_name_map = {field_id: field_name_map.get(field_id, field_id) for field_id in field_ids}
        return {"type": "table", "data": rows, "fieldIds": field_ids, "fieldNameMap": field_name_map}

    return {"type": widget_type, "data": None, "error": f"不支持的类型: {widget_type}"}
