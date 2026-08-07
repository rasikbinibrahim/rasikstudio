from fastapi import APIRouter

from app.api.v1.agents import router as agents_router
from app.api.v1.auth import router as auth_router
from app.api.v1.chat import router as chat_router
from app.api.v1.git import router as git_router
from app.api.v1.models import router as models_router
from app.api.v1.workspaces import router as workspaces_router

# Feature routers attach here as their phases land: files.py/settings.py (workspace CRUD is now
# in workspaces.py; files/settings still need their own design decisions — see
# application/workspaces/README.md), search.py (a standalone `search_files`/
# `grep` endpoint distinct from RAG semantic search, which chat.py's context builder already uses
# via EmbeddingService — Phase 10's own scope only covers the latter).
# health.py deliberately does NOT attach here — api/README.md documents it as unprefixed
# (`/health`, not `/api/v1/health`), mounted directly in app/main.py instead.
router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(workspaces_router)
router.include_router(models_router)
router.include_router(agents_router)
router.include_router(chat_router)
router.include_router(git_router)
