import { cx } from '../../lib/cx';
import styles from './StatTile.module.css';

// A headline number: label, value (with optional unit), and a detail line.
// value may be null when the number doesn't exist yet; `empty` explains why.
function StatTile({ label, value, unit, detail, empty = 'Not available yet', icon: Icon, tone = 'primary', children }) {
  const hasValue = value != null;
  return (
    <div className={styles.tile}>
      <p className={styles.label}>
        {Icon && (
          <span className={cx(styles.icon, styles[tone])} aria-hidden="true">
            <Icon size={16} />
          </span>
        )}
        {label}
      </p>
      <p className={styles.valueRow}>
        {hasValue ? (
          <>
            <span className={styles.value}>{value}</span>
            {unit && <span className={styles.unit}>{unit}</span>}
          </>
        ) : (
          <span className={styles.empty}>{empty}</span>
        )}
      </p>
      {detail && <p className={styles.detail}>{detail}</p>}
      {children}
    </div>
  );
}

export default StatTile;
