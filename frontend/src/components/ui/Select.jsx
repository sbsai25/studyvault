import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';
import styles from './Field.module.css';

// A styled native <select>: keeps the platform's accessible, touch-friendly picker.
function Select({ label, hint, hideLabel = false, icon: Icon, id, size = 'md', className, children, ...selectProps }) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = hint ? `${selectId}-hint` : undefined;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={selectId} className={hideLabel ? 'sr-only' : styles.label}>
        {label}
      </label>
      <div className={cx(styles.control, styles.selectControl, Icon && styles.hasIcon, size === 'sm' && styles.small)}>
        {Icon && <Icon className={styles.leadingIcon} size={16} aria-hidden="true" />}
        <select id={selectId} className={styles.select} aria-describedby={hintId} {...selectProps}>
          {children}
        </select>
        <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default Select;
