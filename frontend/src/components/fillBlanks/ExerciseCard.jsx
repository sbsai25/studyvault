import { FileText, History, TextCursorInput, Trash2, Trophy } from 'lucide-react';
import { formatDate } from '../../lib/dates';
import { displayName } from '../../lib/files';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import IconButton from '../ui/IconButton';
import styles from './ExerciseCard.module.css';

// One fill-in-the-blank set with its attempt history summary
function ExerciseCard({ exercise, onShowAttempts, onDelete, deleting = false }) {
  const questions = exercise.number_of_questions;
  const attempted = exercise.attempt_count > 0;

  return (
    <Card padding="none" className={styles.card}>
      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.icon} aria-hidden="true">
            <TextCursorInput size={20} />
          </span>
          {attempted && exercise.best_percentage != null && (
            <Badge tone={exercise.best_percentage >= 80 ? 'success' : 'neutral'} icon={Trophy}>
              Best {Math.round(exercise.best_percentage)}%
            </Badge>
          )}
        </div>
        <h3 className={styles.title}>{exercise.title}</h3>
        <p className={styles.meta}>
          {questions} sentence{questions === 1 ? '' : 's'} ·{' '}
          {attempted
            ? `${exercise.attempt_count} attempt${exercise.attempt_count === 1 ? '' : 's'}`
            : 'Not attempted yet'}{' '}
          · {formatDate(exercise.created_at)}
        </p>
        {exercise.document_name && (
          <p className={styles.source} title={exercise.document_name}>
            <FileText size={14} aria-hidden="true" />
            <span>{displayName(exercise.document_name)}</span>
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Button size="sm" to={`/fill-blanks/${exercise.id}`} disabled={questions === 0}>
          {attempted ? 'Practise again' : 'Start'}
        </Button>
        {attempted && (
          <Button size="sm" variant="secondary" icon={History} onClick={onShowAttempts}>
            Past attempts
          </Button>
        )}
        <IconButton
          icon={Trash2}
          label={`Delete ${exercise.title}`}
          variant="danger"
          size="sm"
          loading={deleting}
          onClick={onDelete}
          className={styles.delete}
        />
      </div>
    </Card>
  );
}

export default ExerciseCard;
