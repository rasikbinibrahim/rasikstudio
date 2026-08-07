from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.application.git.generate_commit_message import (
    GenerateCommitMessageRequest,
    GenerateCommitMessageUseCase,
)
from app.core.dependencies import CurrentUserDep, ModelRouterDep

router = APIRouter(prefix="/git", tags=["git"])


class GenerateCommitMessageRequestSchema(BaseModel):
    diff: str = Field(min_length=1)
    model: str


class GenerateCommitMessageResponseSchema(BaseModel):
    message: str


@router.post("/generate-commit-message", response_model=GenerateCommitMessageResponseSchema)
async def generate_commit_message(
    body: GenerateCommitMessageRequestSchema, user: CurrentUserDep, model_router: ModelRouterDep
) -> GenerateCommitMessageResponseSchema:
    use_case = GenerateCommitMessageUseCase(model_router)
    message = await use_case.execute(
        GenerateCommitMessageRequest(diff=body.diff, model=body.model)
    )
    return GenerateCommitMessageResponseSchema(message=message)
