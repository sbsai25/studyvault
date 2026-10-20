import { Link } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cx } from '../../lib/cx';
import { formatLongDate, formatRelative } from '../../lib/dates';
import { itemIn } from '../../motion/presets';
import { toFeedEntries } from './activityEvents';
import styles from './ActivityFeed.module.css';

function EntryBody({ entry }) {
  const Icon = entry.icon;
  return (
    <>
      <span className={cx(styles.icon, styles[entry.tone])} aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{entry.title}</span>
        {entry.detail && <span className={styles.detail}>{entry.detail}</span>}
      </span>
      <time className={styles.time} dateTime={entry.createdAt} title={formatLongDate(entry.createdAt)}>
        {formatRelative(entry.createdAt)}
      </time>
    </>
  );
}

// Recent activity, newest first. Entries link to what they refer to.
function ActivityFeed({ events }) {
  const entries = toFeedEntries(events);
  return (
    <ol className={styles.feed}>
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <m.li key={entry.key} variants={itemIn} initial="hidden" animate="show">
            {entry.to ? (
              <Link to={entry.to} className={cx(styles.entry, styles.link)}>
                <EntryBody entry={entry} />
                <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
              </Link>
            ) : (
              <div className={styles.entry}>
                <EntryBody entry={entry} />
              </div>
            )}
          </m.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

export default ActivityFeed;
