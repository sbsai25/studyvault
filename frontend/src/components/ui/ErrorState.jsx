import { CircleAlert, RotateCcw } from 'lucide-react';
import { cx } from '../../lib/cx';
import Button from './Button';
import styles from './ErrorState.module.css';

// Shown when a screen or section failed to load. onRetry runs the request again.
function ErrorState({ title = "Couldn't load this", message, onRetry, size = 'md', titleAs: Title = 'h2', className, children }) {
  return (
    <div className={cx(styles.error, styles[size], className)} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <CircleAlert size={size === 'sm' ? 20 : 24} />
      </span>
      <Title className={styles.title}>{title}</Title>
      {message && <p className={styles.message}>{message}</p>}
      {(onRetry || children) && (
        <div className={styles.actions}>
          {onRetry && (
            <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onRetry}>
              Try again
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export default ErrorState;
