import { m } from 'motion/react';
import { cx } from '../../lib/cx';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { fadeRise } from '../../motion/presets';
import styles from './Page.module.css';

// The content area of one screen. Sets the tab title and fades the page in
// once when it opens. width: default | narrow | full
function Page({ title, width = 'default', className, children }) {
  useDocumentTitle(title);
  return (
    <m.div
      className={cx(styles.page, styles[width], className)}
      variants={fadeRise}
      initial="hidden"
      animate="show"
    >
      {children}
    </m.div>
  );
}

export default Page;
