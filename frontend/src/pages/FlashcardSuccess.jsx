import { useLocation, useParams } from 'react-router-dom';
import { m } from 'motion/react';
import { Layers, RotateCcw, Sparkles } from 'lucide-react';
import { getFlashcardSet } from '../api/client';
import { getErrorMessage, isNotFound } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import Page from '../components/layout/Page';
import { useStudyTools } from '../components/library/useStudyTools';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import styles from './FlashcardSuccess.module.css';

const PREVIEW_CARDS = 3;

// Shown right after a deck is generated. Uses the navigation state for an
// instant first paint, then the saved deck itself.
function FlashcardSuccess() {
  const { setId } = useParams();
  const location = useLocation();
  const initial = location.state ?? {};
  const deck = useApi(() => getFlashcardSet(setId), [setId]);
  const { pending, createFlashcards } = useStudyTools();

  const title = deck.data?.title ?? initial.title;
  const cardCount = deck.data?.cards.length ?? initial.numberOfCards;
  const documentId = deck.data?.document_id ?? initial.documentId;

  if (!title) {
    if (deck.error) {
      return (
        <Page title="Flashcards" width="narrow">
          {isNotFound(deck.error) ? (
            <EmptyState icon={Layers} titleAs="h1" title="Deck not found" description="It may have been deleted.">
              <Button to="/flashcards">Back to decks</Button>
            </EmptyState>
          ) : (
            <ErrorState titleAs="h1" message={getErrorMessage(deck.error)} onRetry={deck.reload} />
          )}
        </Page>
      );
    }
    return (
      <Page title="Flashcards" width="narrow">
        <div className={styles.loading}>
          <Spinner size={22} label="Loading your deck" />
        </div>
      </Page>
    );
  }

  const preview = deck.data?.cards.slice(0, PREVIEW_CARDS) ?? [];
  const regenerating = Boolean(pending);

  return (
    <Page title={title} width="narrow">
      <m.div className={styles.success} variants={stagger(0.08)} initial="hidden" animate="show">
        <m.span className={styles.icon} variants={fadeRise} aria-hidden="true">
          <Sparkles size={28} />
        </m.span>
        <m.p className={styles.eyebrow} variants={fadeRise}>
          Flashcards ready
        </m.p>
        <m.h1 className={styles.title} variants={fadeRise}>
          {title}
        </m.h1>
        {Number.isFinite(cardCount) && (
          <m.p className={styles.count} variants={fadeRise}>
            {cardCount} card{cardCount === 1 ? '' : 's'} created
          </m.p>
        )}

        {preview.length > 0 && (
          <m.div className={styles.preview} variants={fadeRise}>
            <p className={styles.previewLabel}>A first look</p>
            <ol className={styles.previewList}>
              {preview.map((card) => (
                <li key={card.id}>{card.question}</li>
              ))}
            </ol>
          </m.div>
        )}

        <m.div className={styles.actions} variants={fadeRise}>
          <Button size="lg" to={`/flashcards/${setId}`} disabled={cardCount === 0}>
            Study this deck
          </Button>
          <Button
            size="lg"
            variant="secondary"
            icon={RotateCcw}
            loading={regenerating}
            disabled={!documentId}
            onClick={() => createFlashcards({ id: documentId })}
          >
            {regenerating ? 'Creating another set…' : 'Create another set'}
          </Button>
          <Button variant="ghost" to="/flashcards">
            All decks
          </Button>
        </m.div>
      </m.div>
    </Page>
  );
}

export default FlashcardSuccess;
