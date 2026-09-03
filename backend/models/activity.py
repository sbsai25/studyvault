from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base

class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Generic reference ID for the related entity (e.g., document_id, quiz_id, etc.)
    related_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    user = relationship("User", back_populates="activities")
