import { cx } from '../../lib/cx';
import styles from './ProgressBar.module.css';

// value: 0-100, or null for work whose progress isn't known (indeterminate).
// tone: primary | success | danger
function ProgressBar({ value, label, tone = 'primary', size = 'md', className }) {
  const indeterminate = value == null;
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      className={cx(styles.track, styles[size], styles[tone], className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
    >
      <span
        className={cx(styles.fill, indeterminate && styles.indeterminate)}
        style={indeterminate ? undefined : { transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
}

export default ProgressBar;
