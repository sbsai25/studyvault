import { CircleCheck, CircleX, Lightbulb } from 'lucide-react';
import { cx } from '../../lib/cx';
import { splitSentence } from './blanks';
import styles from './ResultItem.module.css';

// One graded sentence, exactly as the API returned it: what was typed,
// whether it matched, the expected answer and any accepted alternatives.
function ResultItem({ result, number }) {
  const [before, after] = splitSentence(result.sentence);
  const answered = Boolean(result.submitted_answer?.trim());
  const alternatives = (result.accepted_answers ?? []).filter(
    (a) => a.trim().toLowerCase() !== result.correct_answer.trim().toLowerCase()
  );
  const Icon = result.is_correct ? CircleCheck : CircleX;

  return (
    <div className={cx(styles.item, result.is_correct ? styles.correct : styles.incorrect)}>
      <Icon className={styles.icon} size={20} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.status}>
          <span className="sr-only">Sentence {number}: </span>
          {result.is_correct ? 'Correct' : answered ? 'Incorrect' : 'Not answered'}
        </p>
        <p className={styles.sentence}>
          {before}
          <span className={cx(styles.answer, !answered && styles.empty)}>
            {answered ? result.submitted_answer : 'no answer'}
          </span>
          {after}
        </p>
        {!result.is_correct && (
          <p className={styles.expected}>
            Answer: <strong>{result.correct_answer}</strong>
            {alternatives.length > 0 && <span> · also accepted: {alternatives.join(', ')}</span>}
          </p>
        )}
        {result.hint && (
          <p className={styles.hint}>
            <Lightbulb size={14} aria-hidden="true" />
            {result.hint}
          </p>
        )}
      </div>
    </div>
  );
}

export default ResultItem;
