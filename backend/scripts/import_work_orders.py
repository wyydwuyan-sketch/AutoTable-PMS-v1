from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy import select

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.db import SessionLocal
from app.models import BaseModel, FieldModel, RecordModel, RecordValueModel, TableModel, ViewModel
from app.seed import init_db
from app.services import now_utc_naive


TABLE_ID = "tbl_1"
BASE_ID = "base_1"
VIEW_ID = "viw_1"
PRIMARY_STAGE_NAME = "一级阶段"
SECONDARY_STAGE_NAME = "二级阶段"


def load_payload(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def ensure_base_and_table(db) -> TableModel:
    base = db.scalar(select(BaseModel).where(BaseModel.id == BASE_ID))
    if not base:
        base = BaseModel(id=BASE_ID, name="我的多维表格")
        db.add(base)

    table = db.scalar(select(TableModel).where(TableModel.id == TABLE_ID))
    if not table:
        table = TableModel(id=TABLE_ID, base_id=BASE_ID, name="工单管理")
        db.add(table)
    else:
        table.name = "工单管理"
    return table


def reset_table_data(db, table_id: str) -> None:
    records = db.scalars(select(RecordModel).where(RecordModel.table_id == table_id)).all()
    for record in records:
        db.delete(record)

    fields = db.scalars(select(FieldModel).where(FieldModel.table_id == table_id)).all()
    for field in fields:
        db.delete(field)

    views = db.scalars(select(ViewModel).where(ViewModel.table_id == table_id)).all()
    for view in views:
        db.delete(view)

    db.flush()


def import_work_orders(payload_path: Path) -> None:
    payload = load_payload(payload_path)
    headers: list[str] = payload["headers"]
    rows: list[dict[str, str | None]] = payload["rows"]

    init_db()
    db = SessionLocal()
    try:
        ensure_base_and_table(db)
        reset_table_data(db, TABLE_ID)

        non_empty_count = {
            header: sum(1 for row in rows if str(row.get(header) or "").strip())
            for header in headers
        }

        stage_pairs = set()
        primary_values = set()
        secondary_values = set()
        for row in rows:
            primary = str(row.get(PRIMARY_STAGE_NAME) or "").strip()
            secondary = str(row.get(SECONDARY_STAGE_NAME) or "").strip()
            if primary:
                primary_values.add(primary)
            if secondary:
                secondary_values.add(secondary)
            if primary and secondary:
                stage_pairs.add((primary, secondary))

        fields: list[FieldModel] = []
        for idx, name in enumerate(headers):
            width = 220 if len(name) <= 8 else 280
            if "描述" in name or "协助内容" in name or "备注" in name:
                width = 420
            field_type = "text"
            options_json = None
            if name == PRIMARY_STAGE_NAME:
                field_type = "singleSelect"
                options_json = [{"id": value, "name": value} for value in sorted(primary_values)]
            elif name == SECONDARY_STAGE_NAME:
                field_type = "singleSelect"
                options_json = [
                    {"id": secondary, "name": secondary, "parentId": primary}
                    for primary, secondary in sorted(stage_pairs)
                ]
                no_parent_options = [
                    {"id": value, "name": value}
                    for value in sorted(secondary_values)
                    if all(pair_secondary != value for _, pair_secondary in stage_pairs)
                ]
                options_json.extend(no_parent_options)
            fields.append(
                FieldModel(
                    id=f"fld_wk_{idx + 1:03d}",
                    table_id=TABLE_ID,
                    name=name,
                    type=field_type,
                    width=width,
                    options_json=options_json,
                    sort_order=idx,
                )
            )
        db.add_all(fields)
        hidden_field_ids = [fields[idx].id for idx, header in enumerate(headers) if non_empty_count[header] == 0]

        view = ViewModel(
            id=VIEW_ID,
            table_id=TABLE_ID,
            name="工单管理视图",
            type="grid",
            config_json={
                "hiddenFieldIds": hidden_field_ids,
                "columnWidths": {field.id: field.width or 220 for field in fields},
                "sorts": [],
                "filters": [],
            },
        )
        db.add(view)

        header_to_field = {header: field for header, field in zip(headers, fields)}
        now = now_utc_naive()
        for row_idx, row in enumerate(rows, start=1):
            record_id = f"rec_wk_{row_idx:04d}"
            db.add(RecordModel(id=record_id, table_id=TABLE_ID, created_at=now, updated_at=now))
            for header in headers:
                raw = row.get(header)
                if raw is None:
                    continue
                value = str(raw).strip()
                if not value:
                    continue
                db.add(
                    RecordValueModel(
                        record_id=record_id,
                        field_id=header_to_field[header].id,
                        value_json=value,
                    )
                )

        db.commit()
        print(
            f"import_ok table={TABLE_ID} fields={len(fields)} records={len(rows)} "
            f"view={VIEW_ID} hidden={len(hidden_field_ids)}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    file_path = ROOT_DIR / "work_orders_import.json"
    import_work_orders(file_path)
