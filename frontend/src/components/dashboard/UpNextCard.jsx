import { ArrowRight, CalendarClock, CheckCheck, Layers, MessagesSquare, Sparkles } from 'lucide-react';
import { formatRelative } from '../../lib/dates';
import { displayName } from '../../lib/files';
import Button from '../ui/Button';
import styles from './UpNextCard.module.css';

// The dashboard's lead card: the most useful next step, from real data only.
// dueDecks: [{ setId, title, count }] sorted by count
function UpNextCard({ dueCount, dueDecks, deckCount, latestDocument, latestConversation, pending, onCreateFlashcards }) {
  let content;

  if (dueCount > 0) {
    const [first] = dueDecks;
    content = (
      <>
        <span className={styles.icon} aria-hidden="true">
          <CalendarClock size={22} />
        </span>
        <p className={styles.eyebrow}>Up next</p>
        <h2 className={styles.title}>
          {dueCount} flashcard{dueCount === 1 ? ' is' : 's are'} due for review
        </h2>
        <p className={styles.description}>Reviewing cards when they come due is what makes them stick.</p>
        {dueDecks.length > 0 && (
          <ul className={styles.decks}>
            {dueDecks.slice(0, 3).map((deck) => (
              <li key={deck.setId}>
                <span className={styles.deckName}>{deck.title}</span>
                <span className={styles.deckCount}>{deck.count} due</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          {first && (
            <Button to={`/flashcards/${first.setId}?mode=due`} iconRight={ArrowRight}>
              Review {first.title}
            </Button>
          )}
          <Button to="/flashcards" variant="secondary">
            All decks
          </Button>
        </div>
      </>
    );
  } else if (deckCount === 0 && latestDocument) {
    const creating = pending?.documentId === latestDocument.id;
    content = (
      <>
        <span className={styles.icon} aria-hidden="true">
          <Layers size={22} />
        </span>
        <p className={styles.eyebrow}>Up next</p>
        <h2 className={styles.title}>Create your first flashcards</h2>
        <p className={styles.description}>
          StudyVault can write a deck from {displayName(latestDocument.filename)} and schedule reviews
          for you.
        </p>
        <div className={styles.actions}>
          <Button icon={Sparkles} loading={creating} disabled={Boolean(pending)} onClick={() => onCreateFlashcards(latestDocument)}>
            {creating ? 'Creating flashcards…' : 'Create flashcards'}
          </Button>
          <Button to="/library" variant="secondary">
            Choose another document
          </Button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <span className={styles.icon} aria-hidden="true">
          <CheckCheck size={22} />
        </span>
        <p className={styles.eyebrow}>Up next</p>
        <h2 className={styles.title}>You’re all caught up</h2>
        <p className={styles.description}>
          No flashcards are due right now. Ask a question or keep practising with your decks.
        </p>
        <div className={styles.actions}>
          <Button to="/chat" icon={MessagesSquare}>
            Ask a question
          </Button>
          <Button to="/flashcards" variant="secondary">
            Browse decks
          </Button>
        </div>
      </>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.main}>{content}</div>
      {latestConversation && <ContinueLink conversation={latestConversation} />}
    </section>
  );
}

function ContinueLink({ conversation }) {
  return (
    <Button
      to={`/chat/${conversation.id}`}
      variant="ghost"
      icon={MessagesSquare}
      iconRight={ArrowRight}
      className={styles.continueLink}
    >
      <span className={styles.continueText}>
        Continue “{conversation.title}”
        <span className={styles.continueTime}> · {formatRelative(conversation.updated_at)}</span>
      </span>
    </Button>
  );
}

export default UpNextCard;
