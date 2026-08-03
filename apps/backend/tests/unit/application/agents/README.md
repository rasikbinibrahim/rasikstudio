# apps/backend/tests/unit/application/agents/

Unit tests for agent task use cases.

Key scenarios:
- `RunAgentTaskUseCase`: task transitions from `pending` to `running` on start
- `ApproveAgentStepUseCase`: sets asyncio.Event, task resumes
- `ApproveAgentStepUseCase` with `approved=False`: task transitions to `cancelled`
- `CancelAgentTaskUseCase`: signals running loop to stop, task reaches `cancelled`
