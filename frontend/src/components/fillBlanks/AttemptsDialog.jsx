import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getFillBlankAttempts } from '../../api/client';
import { cx } from '../../lib/cx';
import { formatLongDate, formatRelative } from '../../lib/dates';
import { getErrorMessage } from '../../lib/errors';
import { useApi } from '../../lib/useApi';
import Dialog from '../ui/Dialog';
import ErrorState from '../ui/ErrorState';
import Spinner from '../ui/Spinner';
import styles from './AttemptsDialog.module.css';

function AttemptList({ exerciseId }) {
  const attempts = useApi(() => getFillBlankAttempts(exerciseId), [exerciseId]);

  if (attempts.data === undefined && attempts.loading) {
    return (
      <div className={styles.loading}>
        <Spinner size={20} label="Loading attempts" />
      </div>
    );
  }
  if (attempts.data === undefined && attempts.error) {
    return <ErrorState size="sm" titleAs="h3" message={getErrorMessage(attempts.error)} onRetry={attempts.reload} />;
  }
  if (attempts.data.length === 0) {
    return <p className={styles.empty}>No attempts yet.</p>;
  }

  return (
    <ol className={styles.list}>
      {attempts.data.map((attempt) => (
        <li key={attempt.attempt_id}>
          <Link to={`/fill-blanks/attempts/${attempt.attempt_id}`} className={styles.row}>
            <span className={cx(styles.score, attempt.percentage >= 80 && styles.good)}>
              {Math.round(attempt.percentage)}%
            </span>
            <span className={styles.detail}>
              <span className={styles.fraction}>
                {attempt.score} of {attempt.total} correct
              </span>
              <time dateTime={attempt.completed_at} title={formatLongDate(attempt.completed_at)}>
                {formatRelative(attempt.completed_at)}
              </time>
            </span>
            <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

// Past attempts at one exercise, newest first; each opens its review.
// `exercise` is kept while closing so the content stays during the exit.
function AttemptsDialog({ open, exercise, onClose }) {
  return (
    <Dialog
      open={open && Boolean(exercise)}
      onClose={onClose}
      title="Past attempts"
      description={exercise?.title}
      size="sm"
    >
      {exercise && <AttemptList exerciseId={exercise.id} />}
    </Dialog>
  );
}

export default AttemptsDialog;
