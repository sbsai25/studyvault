import { m } from 'motion/react';
import { CalendarClock, CircleCheck, RotateCcw } from 'lucide-react';
import { formatRelative, parseServerDate } from '../../lib/dates';
import { fadeRise, stagger } from '../../motion/presets';
import Button from '../ui/Button';
import { RATINGS } from './ratings';
import styles from './SessionComplete.module.css';

// End of a study session: real counts per rating and when the earliest of
// these cards comes back, as returned by the review API.
function SessionComplete({ ratings, total, onRestart }) {
  const saved = Object.values(ratings);
  const counts = RATINGS.map((rating) => ({
    ...rating,
    count: saved.filter((r) => r.rating === rating.value).length,
  }));
  const nextDates = saved.map((r) => parseServerDate(r.nextReviewAt)).filter(Boolean);
  const nextReview = nextDates.length ? new Date(Math.min(...nextDates.map((d) => d.getTime()))) : null;

  return (
    <m.div className={styles.complete} variants={stagger(0.07)} initial="hidden" animate="show">
      <m.span className={styles.icon} variants={fadeRise} aria-hidden="true">
        <CircleCheck size={30} />
      </m.span>
      <m.h2 className={styles.title} variants={fadeRise}>
        Session complete
      </m.h2>
      <m.p className={styles.summary} variants={fadeRise}>
        You reviewed {saved.length} of {total} card{total === 1 ? '' : 's'}.
      </m.p>
      <m.ul className={styles.tally} variants={fadeRise}>
        {counts.map((rating) => (
          <li key={rating.value} className={styles[rating.value]}>
            <span className={styles.count}>{rating.count}</span>
            <span className={styles.label}>{rating.label}</span>
          </li>
        ))}
      </m.ul>
      {nextReview && (
        <m.p className={styles.next} variants={fadeRise}>
          <CalendarClock size={16} aria-hidden="true" />
          The first of these cards comes back {formatRelative(nextReview)}.
        </m.p>
      )}
      <m.div className={styles.actions} variants={fadeRise}>
        <Button variant="secondary" icon={RotateCcw} onClick={onRestart}>
          Study again
        </Button>
        <Button to="/flashcards">Back to decks</Button>
      </m.div>
    </m.div>
  );
}

export default SessionComplete;
