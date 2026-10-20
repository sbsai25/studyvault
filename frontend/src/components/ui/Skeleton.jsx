import { cx } from '../../lib/cx';
import styles from './Skeleton.module.css';

// Placeholder shape shown while content loads. Hidden from screen readers;
// the surrounding region should carry aria-busy.
export function Skeleton({ width = '100%', height = 14, radius, className }) {
  return (
    <span
      className={cx(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <span className={cx(styles.lines, className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  );
}
