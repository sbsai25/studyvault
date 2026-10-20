import { useState } from 'react';
import { m } from 'motion/react';
import { Activity, CalendarClock, Flame, Repeat, Target } from 'lucide-react';
import { getActivity, getStats } from '../api/client';
import { getErrorMessage } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import Page from '../components/layout/Page';
import ActivityChart from '../components/progress/ActivityChart';
import ActivityFeed from '../components/progress/ActivityFeed';
import StatTile from '../components/progress/StatTile';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import ProgressRing from '../components/ui/ProgressRing';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/toast/toastContext';
import styles from './Progress.module.css';

const PAGE_SIZE = 20;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function StatsSkeleton() {
  return (
    <div className={styles.tiles} aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={styles.skeletonTile}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="35%" height={34} />
          <Skeleton width="70%" height={12} />
        </div>
      ))}
    </div>
  );
}

function RecentActivity() {
  const toast = useToast();
  const firstPage = useApi(() => getActivity(PAGE_SIZE, 0), []);
  const [more, setMore] = useState([]);
  const [lastPageSize, setLastPageSize] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  if (firstPage.data === undefined && firstPage.loading) {
    return (
      <div className={styles.feedLoading} aria-busy="true">
        <span className="sr-only">Loading recent activity</span>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={40} radius={10} />
        ))}
      </div>
    );
  }
  if (firstPage.data === undefined && firstPage.error) {
    return <ErrorState size="sm" titleAs="h3" message={getErrorMessage(firstPage.error)} onRetry={firstPage.reload} />;
  }

  const events = [...firstPage.data, ...more];
  if (events.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Activity}
        titleAs="h3"
        title="No activity yet"
        description="Uploads, questions, reviews and exercises will show up here."
      />
    );
  }

  const hasMore = (lastPageSize ?? firstPage.data.length) === PAGE_SIZE;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await getActivity(PAGE_SIZE, events.length);
      setMore((current) => [...current, ...page]);
      setLastPageSize(page.length);
    } catch (error) {
      toast.error("Couldn't load more activity", { description: getErrorMessage(error) });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <ActivityFeed events={events} />
      {hasMore && (
        <div className={styles.loadMore}>
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
            Show older activity
          </Button>
        </div>
      )}
    </>
  );
}

function Progress() {
  const stats = useApi(getStats, []);
  const data = stats.data;

  let overview;
  if (data === undefined && stats.loading) {
    overview = (
      <div aria-busy="true">
        <span className="sr-only">Loading your progress</span>
        <StatsSkeleton />
      </div>
    );
  } else if (data === undefined && stats.error) {
    overview = <ErrorState message={getErrorMessage(stats.error)} onRetry={stats.reload} />;
  } else {
    const reviewedCards = data.flashcards - data.flashcards_never_reviewed;
    const average = data.average_fill_blank_percentage;

    overview = (
      <m.div className={styles.overview} variants={stagger(0.07)} initial="hidden" animate="show">
        <m.div className={styles.tiles} variants={fadeRise}>
          <StatTile
            label="Study streak"
            icon={Flame}
            tone="warm"
            value={data.current_streak_days}
            unit={data.current_streak_days === 1 ? 'day' : 'days'}
            detail={`Longest: ${plural(data.longest_streak_days, 'day')}`}
          />
          <StatTile
            label="Reviews this week"
            icon={Repeat}
            tone="success"
            value={data.reviews_last_7_days}
            detail="Flashcards rated in the last 7 days"
          />
          <StatTile
            label="Cards due now"
            icon={CalendarClock}
            tone="primary"
            value={data.cards_due_now}
            detail={data.cards_due_now > 0 ? 'Ready for review' : 'Nothing due right now'}
          >
            {data.cards_due_now > 0 && (
              <Button size="sm" variant="soft" to="/flashcards" className={styles.tileAction}>
                Review
              </Button>
            )}
          </StatTile>
          <StatTile
            label="Exercise average"
            icon={Target}
            tone="warm"
            value={average == null ? null : `${Math.round(average)}%`}
            empty="No attempts yet"
            detail={
              data.fill_blank_attempts > 0
                ? `Fill in the blanks, across ${plural(data.fill_blank_attempts, 'attempt')}`
                : 'Fill in the blanks'
            }
          />
        </m.div>

        <m.div className={styles.split} variants={fadeRise}>
          <section className={styles.card} aria-labelledby="activity-chart-title">
            <h2 id="activity-chart-title" className={styles.cardTitle}>
              Activity over the last 14 days
            </h2>
            <ActivityChart days={data.daily_activity} variant="full" />
          </section>

          <section className={styles.card} aria-labelledby="coverage-title">
            <h2 id="coverage-title" className={styles.cardTitle}>
              Flashcard coverage
            </h2>
            {data.flashcards > 0 ? (
              <div className={styles.coverage}>
                <ProgressRing
                  value={reviewedCards / data.flashcards}
                  size={112}
                  stroke={10}
                  tone="success"
                  label={`${reviewedCards} of ${data.flashcards} cards reviewed at least once`}
                >
                  <span className={styles.ringValue}>{Math.round((reviewedCards / data.flashcards) * 100)}%</span>
                </ProgressRing>
                <div className={styles.coverageText}>
                  <p className={styles.coverageMain}>
                    {reviewedCards} of {plural(data.flashcards, 'card')} reviewed at least once
                  </p>
                  <p className={styles.coverageDetail}>
                    {data.flashcards_never_reviewed > 0
                      ? `${plural(data.flashcards_never_reviewed, 'card')} not studied yet`
                      : 'Every card has been studied'}
                  </p>
                </div>
              </div>
            ) : (
              <p className={styles.muted}>No flashcards yet. Create a deck to start tracking coverage.</p>
            )}
            <dl className={styles.vault}>
              <div>
                <dt>Documents</dt>
                <dd>{data.documents}</dd>
              </div>
              <div>
                <dt>Decks</dt>
                <dd>{data.flashcard_sets}</dd>
              </div>
              <div>
                <dt>Cards</dt>
                <dd>{data.flashcards}</dd>
              </div>
              <div>
                <dt>Exercises</dt>
                <dd>{data.fill_blank_sets}</dd>
              </div>
            </dl>
          </section>
        </m.div>
      </m.div>
    );
  }

  return (
    <Page title="Progress">
      <PageHeader
        title="Progress"
        description="How your studying is going, based on what you’ve done in StudyVault. Days are counted in UTC."
      />
      {overview}
      <section className={styles.recent} aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title" className={styles.cardTitle}>
          Recent activity
        </h2>
        <RecentActivity />
      </section>
    </Page>
  );
}

export default Progress;
