from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import ensure_schema_upgrades, get_db
from .integrations_scheduler import init_scheduler, shutdown_scheduler
from .routes import (
    auth_router,
    grid_resources_router,
    health_router,
    integrations_router,
    permissions_router,
    tenants_router,
    workflow_router,
)
from .schemas import ErrorOut
from .seed import ensure_seed_data, init_db

app = FastAPI(
    title="Multidimensional Table API",
    version="0.2.0",
    responses={400: {"model": ErrorOut}, 401: {"model": ErrorOut}, 403: {"model": ErrorOut}, 404: {"model": ErrorOut}},
)

allowed_origins = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.211:5173",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[item.strip() for item in allowed_origins.split(",") if item.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(tenants_router)
app.include_router(permissions_router)
app.include_router(grid_resources_router)
app.include_router(workflow_router)
app.include_router(integrations_router)


@app.on_event("startup")
def startup() -> None:
    init_db()
    ensure_schema_upgrades()
    for db in get_db():
        ensure_seed_data(db)
    init_scheduler()


@app.on_event("shutdown")
def shutdown() -> None:
    shutdown_scheduler()


