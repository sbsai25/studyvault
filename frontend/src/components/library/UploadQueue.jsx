import { AnimatePresence, m } from 'motion/react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { fileExtension, formatBytes } from '../../lib/files';
import { itemIn } from '../../motion/presets';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import ProgressBar from '../ui/ProgressBar';
import FileTypeIcon from './FileTypeIcon';
import { useUploads } from './upload/uploadContext';
import styles from './UploadQueue.module.css';

function statusText(item) {
  switch (item.status) {
    case 'queued':
      return 'Waiting to upload';
    case 'uploading':
      return item.progress == null ? 'Uploading…' : `Uploading · ${Math.round(item.progress * 100)}%`;
    case 'processing':
      return 'Processing · extracting text and indexing';
    case 'done':
      return `Ready · ${item.passages} passage${item.passages === 1 ? '' : 's'} indexed`;
    default:
      return item.error;
  }
}

function UploadRow({ item, onDismiss, renderDoneAction }) {
  const active = item.status === 'uploading' || item.status === 'processing';
  const finished = item.status === 'done' || item.status === 'error';

  return (
    <div className={cx(styles.row, styles[item.status])}>
      <FileTypeIcon type={fileExtension(item.name)} size="sm" />
      <div className={styles.body}>
        <div className={styles.line}>
          <span className={styles.name} title={item.name}>
            {item.name}
          </span>
          <span className={styles.size}>{formatBytes(item.size)}</span>
        </div>
        <p className={styles.status}>{statusText(item)}</p>
        {active && (
          <ProgressBar
            size="sm"
            className={styles.progress}
            label={`Uploading ${item.name}`}
            value={item.status === 'uploading' && item.progress != null ? item.progress * 100 : null}
          />
        )}
      </div>
      <div className={styles.trailing}>
        {item.status === 'done' && renderDoneAction?.(item)}
        {item.status === 'done' && (
          <CircleCheck className={styles.doneIcon} size={20} aria-hidden="true" />
        )}
        {item.status === 'error' && (
          <CircleAlert className={styles.errorIcon} size={20} aria-hidden="true" />
        )}
        {finished && (
          <IconButton icon={X} label={`Dismiss ${item.name}`} size="sm" onClick={() => onDismiss(item.id)} />
        )}
      </div>
    </div>
  );
}

// The shared upload queue. renderDoneAction(item) can add a button to
// finished uploads (e.g. "Ask AI").
function UploadQueue({ renderDoneAction, className }) {
  const { items, dismiss, clearFinished } = useUploads();
  if (items.length === 0) return null;

  const finishedCount = items.filter((i) => i.status === 'done' || i.status === 'error').length;

  return (
    <section className={cx(styles.queue, className)} aria-label="Uploads">
      <div className={styles.header}>
        <h2 className={styles.heading}>Uploads</h2>
        {finishedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFinished}>
            Clear finished
          </Button>
        )}
      </div>
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <m.li key={item.id} variants={itemIn} initial="hidden" animate="show" exit="exit">
              <UploadRow item={item} onDismiss={dismiss} renderDoneAction={renderDoneAction} />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

export default UploadQueue;
