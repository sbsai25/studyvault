import { cx } from '../../lib/cx';
import styles from './Badge.module.css';

// tone: neutral | primary | success | warm | danger
function Badge({ tone = 'neutral', icon: Icon, className, children, ...rest }) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} {...rest}>
      {Icon && <Icon size={12} strokeWidth={2.5} aria-hidden="true" />}
      {children}
    </span>
  );
}

export default Badge;
