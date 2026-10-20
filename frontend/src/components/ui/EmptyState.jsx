import { cx } from '../../lib/cx';
import styles from './EmptyState.module.css';

// A friendly explanation for an empty screen or section, with optional
// actions passed as children.
function EmptyState({ icon: Icon, title, description, size = 'md', titleAs: Title = 'h2', className, children }) {
  return (
    <div className={cx(styles.empty, styles[size], className)}>
      {Icon && (
        <span className={styles.icon} aria-hidden="true">
          <Icon size={size === 'sm' ? 20 : 24} />
        </span>
      )}
      <Title className={styles.title}>{title}</Title>
      {description && <p className={styles.description}>{description}</p>}
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}

export default EmptyState;
