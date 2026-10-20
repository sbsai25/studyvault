import { splitSentence } from './blanks';
import styles from './BlankSentence.module.css';

// A sentence with an input where its blank is. Enter calls onEnter.
function BlankSentence({ sentence, value, onChange, onEnter, inputRef, label }) {
  const [before, after] = splitSentence(sentence);
  // Grow with the answer: at least 8 characters wide, at most the line
  const width = `${Math.max(8, value.length + 2)}ch`;

  return (
    <p className={styles.sentence}>
      {before}
      <input
        ref={inputRef}
        className={styles.input}
        style={{ width }}
        value={value}
        aria-label={label}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          }
        }}
      />
      {after}
    </p>
  );
}

export default BlankSentence;
