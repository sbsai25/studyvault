from sqlalchemy.orm import Session

from backend.models.activity import Activity

# Activity types recorded by the API
DOCUMENT_UPLOADED = "document_uploaded"
CHAT_MESSAGE = "chat_message"
FLASHCARDS_GENERATED = "flashcards_generated"
FLASHCARD_REVIEWED = "flashcard_reviewed"
QUIZ_GENERATED = "quiz_generated"
QUIZ_SUBMITTED = "quiz_submitted"
FILL_BLANKS_GENERATED = "fill_blanks_generated"
FILL_BLANKS_SUBMITTED = "fill_blanks_submitted"


def log_activity(
    db: Session,
    user_id: int,
    activity_type: str,
    related_entity_id: int | None = None,
    metadata: dict | None = None,
):
    """Adds an activity record to the current transaction without committing.

    Call it just before the caller's own commit, so the activity is saved
    only if the action itself succeeds.
    """
    db.add(Activity(
        user_id=user_id,
        activity_type=activity_type,
        related_entity_id=related_entity_id,
        metadata_data=metadata,
    ))
