import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCheck, Layers } from 'lucide-react';
import { getDeckDueFlashcards, getFlashcardSet } from '../api/client';
import { getErrorMessage, isNotFound } from '../lib/errors';
import { useApi } from '../lib/useApi';
import StudySession from '../components/flashcards/StudySession';
import Page from '../components/layout/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import styles from './FlashcardStudy.module.css';

const MODES = [
  { value: 'all', label: 'All cards' },
  { value: 'due', label: 'Due & new' },
];

// /flashcards/:setId studies every card; ?mode=due only cards that are due
// for review or have never been reviewed
function FlashcardStudy() {
  const { setId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'due' ? 'due' : 'all';
  const deck = useApi(() => (mode === 'due' ? getDeckDueFlashcards(setId) : getFlashcardSet(setId)), [setId, mode]);
  // A new key starts a fresh session (Study again)
  const [sessionKey, setSessionKey] = useState(0);

  const changeMode = (value) => setSearchParams(value === 'due' ? { mode: 'due' } : {}, { replace: true });

  const restart = () => {
    deck.reload();
    setSessionKey((key) => key + 1);
  };

  let content;
  if (deck.loading) {
    content = (
      <div className={styles.loading} aria-busy="true">
        <span className="sr-only">Loading cards</span>
        <Skeleton width="100%" height={6} radius={3} />
        <Skeleton width="100%" height={340} radius={24} />
      </div>
    );
  } else if (deck.error) {
    content = isNotFound(deck.error) ? (
      <EmptyState icon={Layers} title="Deck not found" description="It may have been deleted.">
        <Button to="/flashcards">Back to decks</Button>
      </EmptyState>
    ) : (
      <ErrorState message={getErrorMessage(deck.error)} onRetry={deck.reload} />
    );
  } else if (deck.data.cards.length === 0) {
    content =
      mode === 'due' ? (
        <EmptyState
          icon={CheckCheck}
          title="All caught up"
          description="No cards in this deck are due right now. Come back later, or study every card."
        >
          <Button variant="secondary" onClick={() => changeMode('all')}>
            Study all cards
          </Button>
          <Button to="/flashcards">Back to decks</Button>
        </EmptyState>
      ) : (
        <EmptyState icon={Layers} title="This deck has no cards" description="Try creating a new deck from the document.">
          <Button to="/flashcards">Back to decks</Button>
        </EmptyState>
      );
  } else {
    content = <StudySession key={`${setId}-${mode}-${sessionKey}`} cards={deck.data.cards} onRestart={restart} />;
  }

  return (
    <Page title={deck.data?.title ?? 'Flashcards'}>
      <PageHeader
        back={{ to: '/flashcards', label: 'All decks' }}
        title={deck.data?.title ?? 'Flashcards'}
        actions={<SegmentedControl label="Cards to study" options={MODES} value={mode} onChange={changeMode} />}
      />
      {content}
    </Page>
  );
}

export default FlashcardStudy;
