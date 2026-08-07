"""Every ORM model must be imported here — Alembic's `env.py` imports this module so
`Base.metadata` is fully populated before `autogenerate` diffs it against the live database."""

from app.infrastructure.db.models.agent import AgentTaskModel, AgentTaskStepModel
from app.infrastructure.db.models.audit import AgentAuditLogModel
from app.infrastructure.db.models.auth import RefreshTokenModel
from app.infrastructure.db.models.base import Base
from app.infrastructure.db.models.chat import ChatSessionModel, MessageModel
from app.infrastructure.db.models.embedding import CodeEmbeddingModel, WorkspaceMemoryModel
from app.infrastructure.db.models.user import UserModel
from app.infrastructure.db.models.workspace import WorkspaceApiKeyModel, WorkspaceModel

__all__ = [
    "AgentAuditLogModel",
    "AgentTaskModel",
    "AgentTaskStepModel",
    "Base",
    "ChatSessionModel",
    "CodeEmbeddingModel",
    "MessageModel",
    "RefreshTokenModel",
    "UserModel",
    "WorkspaceApiKeyModel",
    "WorkspaceMemoryModel",
    "WorkspaceModel",
]
