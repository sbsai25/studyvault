import { m } from 'motion/react';
import { ArrowRight, Sparkles, Upload } from 'lucide-react';
import { displayName } from '../../lib/files';
import { fadeRise, stagger } from '../../motion/presets';
import Button from '../ui/Button';
import styles from './ChatEmptyState.module.css';

const STARTERS = [
  'Summarise the key ideas in my notes',
  'Explain the most important concept in simple terms',
  'What key terms and definitions should I know?',
  'What topics do these materials cover?',
];

// Start of a new conversation: what chat does, plus a few ways to begin.
// Starter prompts are sent as real questions.
function ChatEmptyState({ hasDocuments, scopedDocument, onStart }) {
  return (
    <m.div className={styles.empty} variants={stagger(0.06)} initial="hidden" animate="show">
      <m.span className={styles.orb} variants={fadeRise} aria-hidden="true">
        <Sparkles size={26} />
      </m.span>
      <m.h2 className={styles.title} variants={fadeRise}>
        {scopedDocument ? `Ask about ${displayName(scopedDocument.filename)}` : 'Ask anything about your study materials'}
      </m.h2>
      <m.p className={styles.description} variants={fadeRise}>
        Answers come only from the documents in your library, with the passages they’re based on.
      </m.p>

      {hasDocuments ? (
        <m.ul className={styles.starters} variants={fadeRise} aria-label="Suggested questions">
          {STARTERS.map((prompt) => (
            <li key={prompt}>
              <button type="button" className={styles.starter} onClick={() => onStart(prompt)}>
                <span>{prompt}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </m.ul>
      ) : (
        <m.div className={styles.notice} variants={fadeRise}>
          <p>Your library is empty, so there’s nothing to answer from yet.</p>
          <Button to="/library" icon={Upload} size="sm">
            Upload a document
          </Button>
        </m.div>
      )}
    </m.div>
  );
}

export default ChatEmptyState;
