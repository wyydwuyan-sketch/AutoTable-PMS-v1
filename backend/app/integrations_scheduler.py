from __future__ import annotations

from datetime import datetime

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from .db import db_context, engine
from .integrations_runner import run_connector
from .models import ApiConnectorModel, ConnectorScheduleModel


scheduler: BackgroundScheduler | None = None


def _build_trigger(cron_expr: str) -> CronTrigger:
    expr = (cron_expr or "").strip()
    if not expr:
        raise ValueError("Cron 表达式不能为空")
    parts = expr.split()
    if len(parts) == 5:
        return CronTrigger.from_crontab(expr, timezone="UTC")
    if len(parts) == 6:
        second, minute, hour, day, month, day_of_week = parts
        return CronTrigger(
            second=second,
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone="UTC",
        )
    raise ValueError("Cron 表达式仅支持 5 或 6 段")


def _job_id(connector_id: str) -> str:
    return f"connector_{connector_id}"


def _run_connector_job(connector_id: str) -> None:
    with db_context() as db:
        run_connector(connector_id, db, trigger_source="schedule")


def init_scheduler() -> None:
    global scheduler
    if scheduler is not None:
        return
    jobstores = {"default": SQLAlchemyJobStore(engine=engine)}
    scheduler = BackgroundScheduler(jobstores=jobstores, timezone="UTC")
    scheduler.start()
    reload_all_jobs()


def shutdown_scheduler() -> None:
    global scheduler
    if scheduler is None:
        return
    scheduler.shutdown(wait=False)
    scheduler = None


def upsert_connector_job(connector_id: str, cron_expr: str) -> datetime | None:
    if scheduler is None:
        return None
    trigger = _build_trigger(cron_expr)
    job = scheduler.add_job(
        _run_connector_job,
        trigger=trigger,
        id=_job_id(connector_id),
        replace_existing=True,
        kwargs={"connector_id": connector_id},
    )
    return job.next_run_time


def remove_connector_job(connector_id: str) -> None:
    if scheduler is None:
        return
    if scheduler.get_job(_job_id(connector_id)):
        scheduler.remove_job(_job_id(connector_id))


def reload_all_jobs() -> None:
    if scheduler is None:
        return
    with db_context() as db:
        schedules = db.scalars(
            select(ConnectorScheduleModel)
            .join(ApiConnectorModel, ApiConnectorModel.id == ConnectorScheduleModel.connector_id)
            .where(
                ConnectorScheduleModel.is_enabled.is_(True),
                ApiConnectorModel.is_enabled.is_(True),
            )
        ).all()
        for item in schedules:
            try:
                next_run = upsert_connector_job(item.connector_id, item.cron_expr)
            except ValueError:
                continue
            item.next_run_at = next_run.replace(tzinfo=None) if next_run else None
        db.commit()

