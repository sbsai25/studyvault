import { Flame, Repeat } from 'lucide-react';
import ActivityChart from '../progress/ActivityChart';
import styles from './WeekCard.module.css';

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

// Study rhythm from /stats: streak, recent reviews and daily activity.
// `footer` can hold a link to the full progress page.
function WeekCard({ stats, footer }) {
  return (
    <section className={styles.card} aria-labelledby="week-title">
      <h2 id="week-title" className={styles.heading}>
        Your study rhythm
      </h2>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>
            <Flame size={16} className={styles.flame} aria-hidden="true" />
            Current streak
          </dt>
          <dd>
            <span className={styles.value}>{stats.current_streak_days}</span>
            <span className={styles.unit}>{stats.current_streak_days === 1 ? 'day' : 'days'}</span>
          </dd>
          <dd className={styles.detail}>Longest: {days(stats.longest_streak_days)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>
            <Repeat size={16} className={styles.repeat} aria-hidden="true" />
            Reviews
          </dt>
          <dd>
            <span className={styles.value}>{stats.reviews_last_7_days}</span>
            <span className={styles.unit}>this week</span>
          </dd>
          <dd className={styles.detail}>Flashcards rated in the last 7 days</dd>
        </div>
      </dl>
      <div className={styles.chart}>
        <p className={styles.chartLabel}>Activity, last 14 days</p>
        <ActivityChart days={stats.daily_activity} variant="compact" />
      </div>
      {footer}
    </section>
  );
}

export default WeekCard;
