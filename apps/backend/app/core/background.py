from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any

# `asyncio.create_task()`'s return value must be kept referenced somewhere for the task's
# lifetime — the event loop only holds a *weak* reference, so an unreferenced task can be
# garbage-collected mid-execution (a real, documented asyncio footgun, not a hypothetical one).
# This module-level set is that reference; `add_done_callback` removes it once finished so the
# set doesn't grow unbounded across many task runs. Shared by every backend service that runs
# work in an in-process background task instead of a Celery worker (`AGENT_FRAMEWORK.md` §10's
# implementation note — chat streaming, `application/chat/send_message.py`, uses the same
# reasoning: no broker/worker infrastructure exists in this repo yet).
_background_tasks: set[asyncio.Task[None]] = set()


def fire_and_forget(coro: Coroutine[Any, Any, None]) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
