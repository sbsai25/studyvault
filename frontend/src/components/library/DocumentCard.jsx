import { Trash2 } from 'lucide-react';
import { formatLongDate, formatRelative } from '../../lib/dates';
import { displayName, fileTypeLabel } from '../../lib/files';
import Card from '../ui/Card';
import IconButton from '../ui/IconButton';
import FileTypeIcon from './FileTypeIcon';
import styles from './DocumentCard.module.css';

// One uploaded document. `actions` are the study-tool buttons for it.
function DocumentCard({ document, onDelete, deleting = false, actions }) {
  const passages = document.chunk_count ?? 0;

  return (
    <Card padding="none" className={styles.card}>
      <div className={styles.top}>
        <FileTypeIcon type={document.file_type} />
        <div className={styles.info}>
          <h3 className={styles.name} title={document.filename}>
            {displayName(document.filename)}
          </h3>
          <p className={styles.meta}>
            {fileTypeLabel(document.file_type)} · {passages} passage{passages === 1 ? '' : 's'}
          </p>
          <p className={styles.added}>
            Added{' '}
            <time dateTime={document.created_at} title={formatLongDate(document.created_at)}>
              {formatRelative(document.created_at)}
            </time>
          </p>
        </div>
        {onDelete && (
          <IconButton
            icon={Trash2}
            label={`Delete ${document.filename}`}
            variant="danger"
            size="sm"
            loading={deleting}
            onClick={onDelete}
            className={styles.delete}
          />
        )}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </Card>
  );
}

export default DocumentCard;
