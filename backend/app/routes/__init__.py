from .auth import router as auth_router
from .grid_resources import router as grid_resources_router
from .health import router as health_router
from .permissions import router as permissions_router
from .tenants import router as tenants_router
from .workflow import router as workflow_router

__all__ = [
    "auth_router",
    "grid_resources_router",
    "health_router",
    "permissions_router",
    "tenants_router",
    "workflow_router",
]
