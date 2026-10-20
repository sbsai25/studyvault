import { useRef } from 'react';
import { cx } from '../../lib/cx';
import styles from './SegmentedControl.module.css';

// A single-choice group (radiogroup semantics): arrow keys move the selection,
// and only the selected option is in the tab order.
function SegmentedControl({ label, options, value, onChange, size = 'md', className }) {
  const groupRef = useRef(null);

  const select = (index) => {
    const option = options[(index + options.length) % options.length];
    onChange(option.value);
    const buttons = groupRef.current?.querySelectorAll('[role="radio"]');
    buttons?.[(index + options.length) % options.length]?.focus();
  };

  const onKeyDown = (event, index) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      select(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      select(index - 1);
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className={cx(styles.group, styles[size], className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={cx(styles.option, checked && styles.checked)}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />}
            <span>{option.label}</span>
            {option.count != null && <span className={styles.count}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
