import { cx } from '../../lib/cx';
import styles from './Flashcard.module.css';

// A two-sided card that flips in 3D. Purely presentational: flipping never
// saves anything. Render it with key={card.id} so a new card always starts
// on its question instead of animating back from the previous answer.
function Flashcard({ question, answer, flipped, onFlip }) {
  return (
    <div className={styles.scene}>
      <button
        type="button"
        className={cx(styles.card, flipped && styles.flipped)}
        onClick={onFlip}
        aria-label={
          flipped ? `Answer: ${answer}. Activate to see the question again.` : `Question: ${question}. Activate to reveal the answer.`
        }
      >
        <span className={cx(styles.face, styles.front)} aria-hidden="true">
          <span className={styles.label}>Question</span>
          <span className={styles.text}>{question}</span>
          <span className={styles.hint}>Click or press Space to reveal the answer</span>
        </span>
        <span className={cx(styles.face, styles.back)} aria-hidden="true">
          <span className={cx(styles.label, styles.answerLabel)}>Answer</span>
          <span className={styles.text}>{answer}</span>
          <span className={styles.hint}>Click or press Space to see the question</span>
        </span>
      </button>
    </div>
  );
}

export default Flashcard;
