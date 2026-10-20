import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { CalendarClock, Layers, Plus } from 'lucide-react';
import { deleteFlashcardSet, getDueFlashcards, getFlashcardSets } from '../api/client';
import { getErrorMessage } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import DeckCard from '../components/flashcards/DeckCard';
import Page from '../components/layout/Page';
import CreateFromDocumentDialog from '../components/library/CreateFromDocumentDialog';
import { useStudyTools } from '../components/library/useStudyTools';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/confirm/confirmContext';
import { useToast } from '../components/ui/toast/toastContext';
import styles from './FlashcardDecks.module.css';

function FlashcardDecks() {
  const decks = useApi(getFlashcardSets, []);
  const due = useApi(getDueFlashcards, []);
  const { pending, createFlashcards } = useStudyTools();
  const confirm = useConfirm();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const dueBySet = useMemo(() => {
    const counts = new Map();
    for (const card of due.data ?? []) {
      counts.set(card.flashcard_set_id, (counts.get(card.flashcard_set_id) ?? 0) + 1);
    }
    return counts;
  }, [due.data]);

  const totalDue = due.data?.length ?? 0;

  const handleDelete = async (deck) => {
    const ok = await confirm({
      title: `Delete ${deck.title}?`,
      description: 'Its cards and their review schedule are deleted too. This can’t be undone.',
      confirmLabel: 'Delete deck',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(deck.id);
    try {
      await deleteFlashcardSet(deck.id);
      decks.setData((list = []) => list.filter((d) => d.id !== deck.id));
      due.setData((list = []) => list.filter((card) => card.flashcard_set_id !== deck.id));
      toast.success(`Deleted ${deck.title}`);
    } catch (error) {
      toast.error(`Couldn't delete ${deck.title}`, { description: getErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  };

  let content;
  if (decks.data === undefined && decks.loading) {
    content = (
      <div className={styles.grid} aria-busy="true">
        <span className="sr-only">Loading your decks</span>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={styles.skeleton} aria-hidden="true">
            <Skeleton width={40} height={40} radius={12} />
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={12} />
            <Skeleton width={110} height={32} radius={8} />
          </div>
        ))}
      </div>
    );
  } else if (decks.data === undefined && decks.error) {
    content = <ErrorState message={getErrorMessage(decks.error)} onRetry={decks.reload} />;
  } else if (decks.data.length === 0) {
    content = (
      <EmptyState
        icon={Layers}
        title="No flashcard decks yet"
        description="Create a deck from one of your documents. StudyVault writes the cards and schedules your reviews."
      >
        <Button icon={Plus} onClick={() => setCreateOpen(true)}>
          Create flashcards
        </Button>
      </EmptyState>
    );
  } else {
    content = (
      <>
        {totalDue > 0 && (
          <p className={styles.dueBanner} role="status">
            <CalendarClock size={18} aria-hidden="true" />
            {totalDue} card{totalDue === 1 ? ' is' : 's are'} due for review across{' '}
            {dueBySet.size} deck{dueBySet.size === 1 ? '' : 's'}.
          </p>
        )}
        <m.ul className={styles.grid} variants={stagger(0.05)} initial="hidden" animate="show">
          {decks.data.map((deck) => (
            <m.li key={deck.id} variants={fadeRise}>
              <DeckCard
                deck={deck}
                dueCount={dueBySet.get(deck.id) ?? 0}
                deleting={deletingId === deck.id}
                onDelete={() => handleDelete(deck)}
              />
            </m.li>
          ))}
        </m.ul>
      </>
    );
  }

  return (
    <Page title="Flashcards">
      <PageHeader
        title="Flashcards"
        description="Decks made from your documents. Reviews are spaced out so each card comes back just as you’re likely to forget it."
        actions={
          decks.data?.length > 0 && (
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>
              Create flashcards
            </Button>
          )
        }
      />
      {content}
      <CreateFromDocumentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tool="flashcards"
        pending={pending?.tool === 'flashcards' ? pending : null}
        onCreate={createFlashcards}
      />
    </Page>
  );
}

export default FlashcardDecks;
