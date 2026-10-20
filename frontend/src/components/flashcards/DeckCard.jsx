import { CalendarClock, FileText, Layers, Trash2 } from 'lucide-react';
import { formatDate } from '../../lib/dates';
import { displayName } from '../../lib/files';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import styles from './DeckCard.module.css';

// A flashcard deck. dueCount: reviewed cards in it that are due now.
function DeckCard({ deck, dueCount = 0, onDelete, deleting = false }) {
  const cards = deck.number_of_cards;
  return (
    <article className={styles.stack}>
      <div className={styles.deck}>
        <div className={styles.body}>
          <div className={styles.topRow}>
            <span className={styles.icon} aria-hidden="true">
              <Layers size={20} />
            </span>
            {dueCount > 0 && (
              <Badge tone="warm" icon={CalendarClock}>
                {dueCount} due
              </Badge>
            )}
          </div>
          <h3 className={styles.title}>{deck.title}</h3>
          <p className={styles.meta}>
            {cards} card{cards === 1 ? '' : 's'} · Created {formatDate(deck.created_at)}
          </p>
          {deck.document_name && (
            <p className={styles.source} title={deck.document_name}>
              <FileText size={14} aria-hidden="true" />
              <span>{displayName(deck.document_name)}</span>
            </p>
          )}
        </div>
        <div className={styles.actions}>
          {dueCount > 0 ? (
            <>
              <Button size="sm" to={`/flashcards/${deck.id}?mode=due`}>
                Review {dueCount} due
              </Button>
              <Button size="sm" variant="secondary" to={`/flashcards/${deck.id}`}>
                Study all
              </Button>
            </>
          ) : (
            <Button size="sm" to={`/flashcards/${deck.id}`} disabled={cards === 0}>
              Study deck
            </Button>
          )}
          <IconButton
            icon={Trash2}
            label={`Delete ${deck.title}`}
            variant="danger"
            size="sm"
            loading={deleting}
            onClick={onDelete}
            className={styles.delete}
          />
        </div>
      </div>
    </article>
  );
}

export default DeckCard;
