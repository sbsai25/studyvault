import { useId, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, FileText, Quote } from 'lucide-react';
import { cx } from '../../lib/cx';
import { displayName } from '../../lib/files';
import { itemIn, stagger } from '../../motion/presets';
import styles from './SourceList.module.css';

function sourceLabel(source, documentsById) {
  const name = source.filename ?? documentsById?.get(source.document_id)?.filename;
  return name ? displayName(name) : 'Deleted document';
}

// The passages an answer was based on. Each chip expands to show the
// retrieved snippet. Older messages may only have document ids.
function SourceList({ sources, documentsById, animate = false }) {
  const [openKey, setOpenKey] = useState(null);
  const baseId = useId();
  if (!sources?.length) return null;

  const open = sources.find((s, i) => (s.chunk_id ?? i) === openKey);
  const openIndex = open ? sources.indexOf(open) : -1;

  return (
    <div className={styles.sources}>
      <p className={styles.label}>
        <Quote size={14} aria-hidden="true" />
        Sources
      </p>
      <m.ul
        className={styles.chips}
        variants={stagger(0.05, 0.1)}
        initial={animate ? 'hidden' : false}
        animate="show"
      >
        {sources.map((source, index) => {
          const key = source.chunk_id ?? index;
          const label = sourceLabel(source, documentsById);
          const passage = Number.isInteger(source.chunk_index) ? `passage ${source.chunk_index + 1}` : null;
          const expandable = Boolean(source.snippet);
          const isOpen = openKey === key;
          return (
            <m.li key={key} variants={itemIn}>
              {expandable ? (
                <button
                  type="button"
                  className={cx(styles.chip, isOpen && styles.chipOpen)}
                  aria-expanded={isOpen}
                  aria-controls={`${baseId}-snippet`}
                  onClick={() => setOpenKey(isOpen ? null : key)}
                >
                  <FileText size={14} aria-hidden="true" />
                  <span className={styles.chipName}>{label}</span>
                  {passage && <span className={styles.passage}>{passage}</span>}
                  <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
                </button>
              ) : (
                <span className={styles.chip}>
                  <FileText size={14} aria-hidden="true" />
                  <span className={styles.chipName}>{label}</span>
                  {passage && <span className={styles.passage}>{passage}</span>}
                </span>
              )}
            </m.li>
          );
        })}
      </m.ul>
      <AnimatePresence initial={false}>
        {open && (
          <m.blockquote
            key={openKey}
            id={`${baseId}-snippet`}
            className={styles.snippet}
            variants={itemIn}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <p>{open.snippet}</p>
            <footer className={styles.snippetSource}>
              From {sourceLabel(open, documentsById)}
              {Number.isInteger(open.chunk_index) && `, passage ${open.chunk_index + 1}`}
              <span className="sr-only"> (source {openIndex + 1} of {sources.length})</span>
            </footer>
          </m.blockquote>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SourceList;
