from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    # Every `Mapped[datetime]` column, in every model, maps to TIMESTAMPTZ by default — matching
    # DATABASE_DESIGN.md's schema (every timestamp column there is TIMESTAMPTZ, never bare
    # TIMESTAMP) without needing `mapped_column(DateTime(timezone=True))` repeated on each one.
    type_annotation_map = {datetime: DateTime(timezone=True)}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
