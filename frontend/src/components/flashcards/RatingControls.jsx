import { cx } from '../../lib/cx';
import Spinner from '../ui/Spinner';
import { RATINGS } from './ratings';
import styles from './RatingControls.module.css';

function RatingControls({ onRate, submitting, disabled }) {
  return (
    <div className={styles.controls} role="group" aria-label="How well did you know it?">
      {RATINGS.map((rating) => (
        <button
          key={rating.value}
          type="button"
          className={cx(styles.rating, styles[rating.value])}
          onClick={() => onRate(rating.value)}
          disabled={disabled || Boolean(submitting)}
          aria-keyshortcuts={rating.key}
        >
          <span className={styles.top}>
            {submitting === rating.value ? <Spinner size={14} /> : <kbd aria-hidden="true">{rating.key}</kbd>}
            <span className={styles.label}>{rating.label}</span>
          </span>
          <span className={styles.hint}>{rating.hint}</span>
        </button>
      ))}
    </div>
  );
}

export default RatingControls;
