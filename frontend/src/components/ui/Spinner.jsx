import { cx } from '../../lib/cx';
import styles from './Spinner.module.css';

// Decorative by default; pass `label` when the spinner is the only sign that
// something is loading, so screen readers announce it.
function Spinner({ size = 16, label, className }) {
  return (
    <span
      className={cx(styles.spinner, className)}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
      data-motion-essential=""
    >
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export default Spinner;
