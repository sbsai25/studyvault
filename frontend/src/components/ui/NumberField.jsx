import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import IconButton from './IconButton';
import styles from './NumberField.module.css';

// A whole number within [min, max], with − and + buttons. Typing is allowed
// and the value is clamped when the field loses focus.
function NumberField({ label, hint, value, min, max, onChange, disabled = false }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  // Keep the text in step when the value changes from outside (the buttons)
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }

  const clamp = (n) => Math.min(max, Math.max(min, n));
  const commit = (raw) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isNaN(parsed) ? value : clamp(parsed);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <IconButton
          icon={Minus}
          label={`Fewer (minimum ${min})`}
          variant="secondary"
          size="sm"
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
        />
        <input
          id={id}
          className={styles.input}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={text}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
        />
        <IconButton
          icon={Plus}
          label={`More (maximum ${max})`}
          variant="secondary"
          size="sm"
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + 1))}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default NumberField;
