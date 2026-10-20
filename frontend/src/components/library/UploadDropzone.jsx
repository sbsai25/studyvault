import { useRef, useState } from 'react';
import { CloudUpload, Upload } from 'lucide-react';
import { cx } from '../../lib/cx';
import { MAX_UPLOAD_MB, SUPPORTED_EXTENSIONS_LABEL } from '../../lib/files';
import Button from '../ui/Button';
import { useUploads } from './upload/uploadContext';
import styles from './UploadDropzone.module.css';

const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

// Drag-and-drop target plus a "Choose files" button. Files go to the shared
// upload queue. size: lg (empty library, dashboard) | compact
function UploadDropzone({ size = 'lg', title, description, className }) {
  const { addFiles, openPicker } = useUploads();
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for child elements; count them
  const depth = useRef(0);

  const onDragEnter = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (event) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };

  const onDrop = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const large = size === 'lg';

  return (
    <div
      className={cx(styles.zone, styles[size], dragging && styles.dragging, className)}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className={styles.icon} aria-hidden="true">
        <CloudUpload size={large ? 26 : 20} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{dragging ? 'Drop to upload' : (title ?? 'Drag and drop study files here')}</p>
        {large && description && <p className={styles.description}>{description}</p>}
        <p className={styles.hint}>
          {SUPPORTED_EXTENSIONS_LABEL} · up to {MAX_UPLOAD_MB} MB each
        </p>
      </div>
      <Button
        icon={Upload}
        variant={large ? 'primary' : 'secondary'}
        size={large ? 'lg' : 'md'}
        onClick={openPicker}
        className={styles.button}
      >
        Choose files
      </Button>
    </div>
  );
}

export default UploadDropzone;
