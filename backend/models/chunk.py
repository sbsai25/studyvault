from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    document = relationship("Document", back_populates="chunks")
    user = relationship("User", back_populates="chunks")
    
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
