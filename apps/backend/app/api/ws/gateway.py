from __future__ import annotations

import asyncio
from uuid import UUID

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError as PydanticValidationError

from app.api.ws.connection_manager import connection_manager
from app.api.ws.event_types import AuthMessage, ConnectedMessage, PongMessage
from app.core.config import get_settings
from app.core.dependencies import DbDep, resolve_user_from_token
from app.core.errors import AuthError

logger = structlog.get_logger("ws")

router = APIRouter()

AUTH_TIMEOUT_SECONDS = 10
CLOSE_CODE_UNAUTHORIZED = 4401


@router.websocket("/ws/{workspace_id}")
async def websocket_gateway(websocket: WebSocket, workspace_id: UUID, db: DbDep) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "auth_required"})

    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=AUTH_TIMEOUT_SECONDS)
    except (TimeoutError, WebSocketDisconnect):
        await websocket.close(code=CLOSE_CODE_UNAUTHORIZED)
        return

    try:
        auth_message = AuthMessage.model_validate(raw)
    except PydanticValidationError:
        await websocket.close(code=CLOSE_CODE_UNAUTHORIZED)
        return

    settings = get_settings()

    try:
        user = await resolve_user_from_token(auth_message.token, settings, db)
    except AuthError:
        await websocket.close(code=CLOSE_CODE_UNAUTHORIZED)
        return

    connection_manager.register(workspace_id, user.id, websocket)
    logger.info("ws_connected", workspace_id=str(workspace_id), user_id=str(user.id))

    try:
        await websocket.send_json(
            ConnectedMessage(workspace_id=workspace_id, user_id=user.id).model_dump(mode="json")
        )

        while True:
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_json(), timeout=settings.ws_idle_timeout_seconds
                )
            except TimeoutError:
                logger.info("ws_idle_timeout", workspace_id=str(workspace_id), user_id=str(user.id))
                await websocket.close()
                break

            message_type = raw.get("type")
            if message_type == "ping":
                await websocket.send_json(PongMessage().model_dump())
            elif message_type == "agent_approve":
                # Defined in event_types.py but never actually sent by the desktop client — real
                # agent-step approval goes through `POST /api/v1/agents/{id}/approve` (REST, see
                # `application/agents/approve_step.py`), built after this message type was
                # scaffolded. Logged, not silently dropped, in case anything ever does send it.
                logger.info(
                    "ws_agent_approve_received_but_unused_desktop_uses_rest_instead",
                    workspace_id=str(workspace_id),
                    user_id=str(user.id),
                )
            else:
                logger.warning("ws_unknown_message_type", message_type=message_type)
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.unregister(workspace_id, user.id, websocket)
        logger.info("ws_disconnected", workspace_id=str(workspace_id), user_id=str(user.id))
