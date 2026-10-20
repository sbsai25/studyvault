import { Link } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { formatRelative } from '../../lib/dates';
import { displayName, fileTypeLabel } from '../../lib/files';
import FileTypeIcon from '../library/FileTypeIcon';
import Button from '../ui/Button';
import styles from './RecentDocuments.module.css';

// The most recently uploaded documents, newest first
function RecentDocuments({ documents, total }) {
  return (
    <section className={styles.card} aria-labelledby="recent-documents-title">
      <div className={styles.header}>
        <h2 id="recent-documents-title" className={styles.heading}>
          Recent documents
        </h2>
        <Link to="/library" className={styles.viewAll}>
          View library{total > documents.length ? ` (${total})` : ''}
        </Link>
      </div>
      <ul className={styles.list}>
        {documents.map((doc) => (
          <li key={doc.id} className={styles.row}>
            <FileTypeIcon type={doc.file_type} size="sm" />
            <div className={styles.info}>
              <span className={styles.name} title={doc.filename}>
                {displayName(doc.filename)}
              </span>
              <span className={styles.meta}>
                {fileTypeLabel(doc.file_type)} · {formatRelative(doc.created_at)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={MessagesSquare}
              to={`/chat?document=${doc.id}`}
              aria-label={`Ask AI about ${doc.filename}`}
            >
              Ask
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RecentDocuments;
