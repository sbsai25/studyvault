import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cx } from '../../lib/cx';
import styles from './QuickActions.module.css';

// actions: [{ to, label, description, icon, tone }]
function QuickActions({ actions }) {
  return (
    <section aria-labelledby="quick-actions-title">
      <h2 id="quick-actions-title" className={styles.heading}>
        Jump back in
      </h2>
      <ul className={styles.grid}>
        {actions.map(({ to, label, description, icon: Icon, tone = 'primary' }) => (
          <li key={to}>
            <Link to={to} className={styles.tile}>
              <span className={cx(styles.icon, styles[tone])} aria-hidden="true">
                <Icon size={20} />
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{label}</span>
                <span className={styles.description}>{description}</span>
              </span>
              <ArrowUpRight size={18} className={styles.arrow} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default QuickActions;
