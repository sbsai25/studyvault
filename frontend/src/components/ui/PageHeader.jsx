import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cx } from '../../lib/cx';
import styles from './PageHeader.module.css';

// The page title (the page's only <h1>), an optional description, a back
// link and actions aligned to the right.
function PageHeader({ title, description, eyebrow, back, actions, className }) {
  return (
    <header className={cx(styles.header, className)}>
      <div className={styles.text}>
        {back && (
          <Link to={back.to} className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

export default PageHeader;
