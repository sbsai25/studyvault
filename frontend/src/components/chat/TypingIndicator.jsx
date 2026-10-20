import { m } from 'motion/react';
import { itemIn } from '../../motion/presets';
import AssistantAvatar from './AssistantAvatar';
import styles from './ChatMessage.module.css';

// Shown only while a real answer request is in flight
function TypingIndicator() {
  return (
    <m.div className={styles.assistant} variants={itemIn} initial="hidden" animate="show">
      <AssistantAvatar />
      <div className={styles.typing} role="status">
        {/* Opacity-only pulse, kept with reduced motion so the wait stays visible */}
        <span className={styles.dots} aria-hidden="true">
          <span data-motion-essential="" />
          <span data-motion-essential="" />
          <span data-motion-essential="" />
        </span>
        <span className={styles.typingLabel}>Reading your documents…</span>
      </div>
    </m.div>
  );
}

export default TypingIndicator;
