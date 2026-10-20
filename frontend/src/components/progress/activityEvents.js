import { Activity, Layers, MessagesSquare, Repeat, TextCursorInput, Trophy, Upload } from 'lucide-react';
import { displayName } from '../../lib/files';
import { ratingLabel } from '../flashcards/ratings';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// How each activity type from /activity is shown. Unknown types (for
// example from removed features) fall back to a neutral entry.
function describe(event) {
  const meta = event.metadata ?? {};
  switch (event.activity_type) {
    case 'document_uploaded':
      return {
        icon: Upload,
        tone: 'primary',
        title: meta.filename ? `Uploaded ${displayName(meta.filename)}` : 'Uploaded a document',
        detail: Number.isInteger(meta.chunks) ? `${plural(meta.chunks, 'passage')} indexed` : null,
        to: '/library',
      };
    case 'chat_message':
      return {
        icon: MessagesSquare,
        tone: 'primary',
        title: 'Asked a question',
        detail: Number.isInteger(meta.sources)
          ? meta.sources > 0
            ? `Answered from ${plural(meta.sources, 'source')}`
            : 'No matching passages found'
          : null,
        to: event.related_entity_id ? `/chat/${event.related_entity_id}` : null,
      };
    case 'flashcards_generated':
      return {
        icon: Layers,
        tone: 'success',
        title: 'Created a flashcard deck',
        detail: Number.isInteger(meta.number_of_cards) ? plural(meta.number_of_cards, 'card') : null,
        to: event.related_entity_id ? `/flashcards/${event.related_entity_id}` : null,
      };
    case 'flashcard_reviewed':
      return {
        icon: Repeat,
        tone: 'success',
        title: 'Reviewed a flashcard',
        detail: meta.rating ? `Rated ${ratingLabel(meta.rating)}` : null,
        to: meta.flashcard_set_id ? `/flashcards/${meta.flashcard_set_id}` : null,
      };
    case 'fill_blanks_generated':
      return {
        icon: TextCursorInput,
        tone: 'warm',
        title: 'Created a fill-in-the-blank exercise',
        detail: Number.isInteger(meta.number_of_questions) ? plural(meta.number_of_questions, 'sentence') : null,
        to: event.related_entity_id ? `/fill-blanks/${event.related_entity_id}` : null,
      };
    case 'fill_blanks_submitted':
      return {
        icon: Trophy,
        tone: 'warm',
        title: 'Completed a fill-in-the-blank exercise',
        detail: Number.isInteger(meta.score) && Number.isInteger(meta.total) ? `${meta.score} of ${meta.total} correct` : null,
        to: meta.attempt_id ? `/fill-blanks/attempts/${meta.attempt_id}` : null,
      };
    default:
      return { icon: Activity, tone: 'neutral', title: 'Activity', detail: null, to: null };
  }
}

// Turns events (newest first) into feed entries. Runs of flashcard reviews
// become one entry ("Reviewed 12 flashcards") with a count per rating.
export function toFeedEntries(events) {
  const entries = [];
  for (const event of events) {
    const previous = entries[entries.length - 1];
    if (event.activity_type === 'flashcard_reviewed' && previous?.type === 'flashcard_reviewed') {
      previous.count += 1;
      const rating = event.metadata?.rating;
      if (rating) previous.ratings[rating] = (previous.ratings[rating] ?? 0) + 1;
      previous.earliest = event.created_at;
      continue;
    }
    const entry = {
      key: event.id,
      type: event.activity_type,
      createdAt: event.created_at,
      earliest: event.created_at,
      count: 1,
      ratings: {},
      ...describe(event),
    };
    if (event.activity_type === 'flashcard_reviewed' && event.metadata?.rating) {
      entry.ratings[event.metadata.rating] = 1;
    }
    entries.push(entry);
  }

  return entries.map((entry) => {
    if (entry.type !== 'flashcard_reviewed' || entry.count === 1) return entry;
    const breakdown = Object.entries(entry.ratings)
      .map(([rating, n]) => `${ratingLabel(rating)} ${n}`)
      .join(' · ');
    return { ...entry, title: `Reviewed ${entry.count} flashcards`, detail: breakdown || null };
  });
}
