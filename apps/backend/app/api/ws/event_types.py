from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# Server → client event catalog: union of BACKEND_ARCHITECTURE.md §6 (canonical channel/event
# reference) and phase-07-websocket-gateway.md's "initial set" — the two listed slightly different
# events (git_status_changed/file_changed only in phase-07; agent_started/agent_completed/
# agent_failed/index_progress only in the architecture doc), so this is the union of both rather
# than either alone being incomplete.


class _BaseEvent(BaseModel):
    workspace_id: UUID
    # None for events with no single-user origin (shared/broadcast events like file_changed) —
    # publisher.py requires it when publishing to a user-scoped channel, not here.
    user_id: UUID | None = None
    timestamp: datetime


class StreamChunkEvent(_BaseEvent):
    type: Literal["stream_chunk"] = "stream_chunk"
    message_id: UUID
    delta: str


class StreamEndEvent(_BaseEvent):
    type: Literal["stream_end"] = "stream_end"
    message_id: UUID
    finish_reason: str
    usage: dict[str, int]


class AgentStartedEvent(_BaseEvent):
    type: Literal["agent_started"] = "agent_started"
    task_id: UUID
    description: str


class AgentStepEvent(_BaseEvent):
    type: Literal["agent_step"] = "agent_step"
    task_id: UUID
    step_index: int
    tool: str
    args: dict[str, object]
    result: str | None = None


class AgentApprovalRequiredEvent(_BaseEvent):
    type: Literal["agent_approval_required"] = "agent_approval_required"
    task_id: UUID
    action: str
    preview: str | None = None


class AgentQuestionAskedEvent(_BaseEvent):
    """Distinct from `AgentApprovalRequiredEvent` — an approval is a binary yes/no gate on one
    specific tool call about to run; this is the agent pausing to ask an open-ended clarifying
    question via the `ask_followup_question` tool (Cline's `ask_followup_question` equivalent,
    see `docs/reference/cline/TOOL_DESIGN_NOTES.md`) before it decides what to do next at all."""

    type: Literal["agent_question_asked"] = "agent_question_asked"
    task_id: UUID
    question: str


class AgentStatusChangedEvent(_BaseEvent):
    type: Literal["agent_status_changed"] = "agent_status_changed"
    task_id: UUID
    status: str


class AgentCompletedEvent(_BaseEvent):
    type: Literal["agent_completed"] = "agent_completed"
    task_id: UUID
    summary: str


class AgentFailedEvent(_BaseEvent):
    type: Literal["agent_failed"] = "agent_failed"
    task_id: UUID
    error: str


class FileChangedEvent(_BaseEvent):
    type: Literal["file_changed"] = "file_changed"
    path: str
    change: Literal["created", "modified", "deleted"]


class GitStatusChangedEvent(_BaseEvent):
    type: Literal["git_status_changed"] = "git_status_changed"
    branch: str


class IndexProgressEvent(_BaseEvent):
    """Also covers phase-07's "workspace_indexed" — that's this event at files_done ==
    files_total, not a separate event type; two names for the same completion state would just
    invite the two to drift out of sync with each other."""

    type: Literal["index_progress"] = "index_progress"
    files_done: int
    files_total: int


_AnyServerEvent = (
    StreamChunkEvent
    | StreamEndEvent
    | AgentStartedEvent
    | AgentStepEvent
    | AgentApprovalRequiredEvent
    | AgentQuestionAskedEvent
    | AgentStatusChangedEvent
    | AgentCompletedEvent
    | AgentFailedEvent
    | FileChangedEvent
    | GitStatusChangedEvent
    | IndexProgressEvent
)
ServerEvent = Annotated[_AnyServerEvent, Field(discriminator="type")]


# Client → server messages (connection lifecycle + control), per AUTHENTICATION.md §7 / ADR 0005.


class AuthMessage(BaseModel):
    type: Literal["auth"] = "auth"
    token: str


class PingMessage(BaseModel):
    type: Literal["ping"] = "ping"


class AgentApproveMessage(BaseModel):
    type: Literal["agent_approve"] = "agent_approve"
    task_id: UUID
    approved: bool


ClientMessage = Annotated[
    AuthMessage | PingMessage | AgentApproveMessage, Field(discriminator="type")
]


# Server → client connection-lifecycle messages (not "events" in the ServerEvent sense above —
# these are gateway protocol messages, not application data).


class AuthRequiredMessage(BaseModel):
    type: Literal["auth_required"] = "auth_required"


class ConnectedMessage(BaseModel):
    type: Literal["connected"] = "connected"
    workspace_id: UUID
    user_id: UUID


class PongMessage(BaseModel):
    type: Literal["pong"] = "pong"
