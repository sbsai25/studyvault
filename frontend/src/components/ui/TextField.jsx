import { useId } from 'react';
import { cx } from '../../lib/cx';
import styles from './Field.module.css';

// A labelled text input with optional hint, error, leading icon and a
// trailing element (for example a show-password button).
function TextField({
  label,
  hint,
  error,
  icon: Icon,
  trailing,
  hideLabel = false,
  id,
  className,
  ref,
  ...inputProps
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : styles.label}>
        {label}
      </label>
      <div className={cx(styles.control, error && styles.invalid, Icon && styles.hasIcon)}>
        {Icon && <Icon className={styles.leadingIcon} size={18} aria-hidden="true" />}
        <input
          ref={ref}
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(hintId, errorId) || undefined}
          {...inputProps}
        />
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </div>
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export default TextField;
