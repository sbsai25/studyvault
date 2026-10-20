import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { Layers, MessagesSquare, TextCursorInput, Upload } from 'lucide-react';
import { getConversations, getDocuments, getDueFlashcards, getFlashcardSets, getStats } from '../api/client';
import { greetingFor } from '../lib/dates';
import { getErrorMessage } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import OnboardingHero from '../components/dashboard/OnboardingHero';
import QuickActions from '../components/dashboard/QuickActions';
import RecentDocuments from '../components/dashboard/RecentDocuments';
import UpNextCard from '../components/dashboard/UpNextCard';
import WeekCard from '../components/dashboard/WeekCard';
import Page from '../components/layout/Page';
import UploadQueue from '../components/library/UploadQueue';
import { useUploads } from '../components/library/upload/uploadContext';
import { useStudyTools } from '../components/library/useStudyTools';
import Button from '../components/ui/Button';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import styles from './Dashboard.module.css';

const RECENT_DOCUMENTS = 4;

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function CardSkeleton({ tall = false }) {
  return (
    <div className={styles.skeletonCard} style={{ minHeight: tall ? 280 : 120 }} aria-hidden="true">
      <Skeleton width={44} height={44} radius={12} />
      <Skeleton width="55%" height={20} />
      <Skeleton width="80%" />
      <Skeleton width="40%" />
    </div>
  );
}

function Dashboard() {
  const { documentsVersion, openPicker } = useUploads();
  const documents = useApi(getDocuments, [documentsVersion]);
  const stats = useApi(getStats, [documentsVersion]);
  const due = useApi(getDueFlashcards, []);
  const decks = useApi(getFlashcardSets, []);
  const conversations = useApi(getConversations, []);
  const { pending, createFlashcards } = useStudyTools();
  const [today] = useState(() => new Date());

  // Due cards grouped by deck, most due first
  const dueDecks = useMemo(() => {
    const titles = new Map((decks.data ?? []).map((deck) => [deck.id, deck.title]));
    const counts = new Map();
    for (const card of due.data ?? []) {
      counts.set(card.flashcard_set_id, (counts.get(card.flashcard_set_id) ?? 0) + 1);
    }
    return [...counts]
      .map(([setId, n]) => ({ setId, count: n, title: titles.get(setId) ?? 'Flashcard deck' }))
      .sort((a, b) => b.count - a.count);
  }, [due.data, decks.data]);

  const dueCount = due.data?.length ?? stats.data?.cards_due_now ?? 0;
  const upNextLoading = (due.data === undefined && due.loading) || (decks.data === undefined && decks.loading);

  const header = (
    <PageHeader
      eyebrow={today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      title={greetingFor(today)}
      description="Here’s where your studying stands."
      actions={
        <>
          <Button variant="secondary" icon={MessagesSquare} to="/chat">
            Ask AI
          </Button>
          <Button icon={Upload} onClick={openPicker}>
            Upload files
          </Button>
        </>
      }
    />
  );

  let content;
  if (documents.data === undefined && documents.loading) {
    content = (
      <div className={styles.topGrid} aria-busy="true">
        <span className="sr-only">Loading your dashboard</span>
        <CardSkeleton tall />
        <CardSkeleton tall />
      </div>
    );
  } else if (documents.data === undefined && documents.error) {
    content = <ErrorState message={getErrorMessage(documents.error)} onRetry={documents.reload} />;
  } else if (documents.data.length === 0) {
    content = (
      <div className={styles.stack}>
        <UploadQueue />
        <OnboardingHero />
      </div>
    );
  } else {
    const deckCount = decks.data?.length ?? stats.data?.flashcard_sets ?? 0;
    const quickActions = [
      {
        to: '/chat',
        label: 'AI Chat',
        description: 'Ask questions about your documents',
        icon: MessagesSquare,
        tone: 'primary',
      },
      {
        to: '/flashcards',
        label: 'Flashcards',
        description: stats.data
          ? `${count(stats.data.flashcard_sets, 'deck')} · ${count(stats.data.flashcards, 'card')}`
          : 'Review your decks',
        icon: Layers,
        tone: 'success',
      },
      {
        to: '/fill-blanks',
        label: 'Fill in the Blanks',
        description: stats.data
          ? `${count(stats.data.fill_blank_sets, 'exercise')} · ${count(stats.data.fill_blank_attempts, 'attempt')}`
          : 'Practise recalling key terms',
        icon: TextCursorInput,
        tone: 'warm',
      },
    ];

    content = (
      <m.div className={styles.stack} variants={stagger(0.07)} initial="hidden" animate="show">
        <UploadQueue />
        <m.div className={styles.topGrid} variants={fadeRise}>
          {upNextLoading ? (
            <CardSkeleton tall />
          ) : (
            <UpNextCard
              dueCount={dueCount}
              dueDecks={dueDecks}
              deckCount={deckCount}
              latestDocument={documents.data[0]}
              latestConversation={conversations.data?.[0]}
              pending={pending}
              onCreateFlashcards={createFlashcards}
            />
          )}
          {stats.data ? (
            <WeekCard stats={stats.data} />
          ) : stats.error ? (
            <div className={styles.errorCard}>
              <ErrorState
                size="sm"
                titleAs="h2"
                title="Couldn't load your stats"
                message={getErrorMessage(stats.error)}
                onRetry={stats.reload}
              />
            </div>
          ) : (
            <CardSkeleton tall />
          )}
        </m.div>
        <m.div variants={fadeRise}>
          <QuickActions actions={quickActions} />
        </m.div>
        <m.div variants={fadeRise}>
          <RecentDocuments documents={documents.data.slice(0, RECENT_DOCUMENTS)} total={documents.data.length} />
        </m.div>
      </m.div>
    );
  }

  return (
    <Page title="Dashboard">
      {header}
      {content}
    </Page>
  );
}

export default Dashboard;
