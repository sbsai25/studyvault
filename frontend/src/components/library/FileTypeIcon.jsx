import { File, FileCode, FileText, FileType, Presentation } from 'lucide-react';
import { cx } from '../../lib/cx';
import styles from './FileTypeIcon.module.css';

// Colour-coded tile per file type. Decorative: the type is always also
// written out next to it.
const TYPES = {
  pdf: { icon: FileText, tone: 'danger' },
  docx: { icon: FileText, tone: 'primary' },
  pptx: { icon: Presentation, tone: 'warm' },
  md: { icon: FileCode, tone: 'success' },
  txt: { icon: FileType, tone: 'neutral' },
};

function FileTypeIcon({ type, size = 'md', className }) {
  const { icon: Icon, tone } = TYPES[type] ?? { icon: File, tone: 'neutral' };
  return (
    <span className={cx(styles.tile, styles[tone], styles[size], className)} aria-hidden="true">
      <Icon size={size === 'sm' ? 16 : 20} />
    </span>
  );
}

export default FileTypeIcon;
