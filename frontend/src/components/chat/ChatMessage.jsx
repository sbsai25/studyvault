import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { Check, CircleAlert, Copy, RotateCcw } from 'lucide-react';
import { cx } from '../../lib/cx';
import { itemIn } from '../../motion/presets';
import Button from '../ui/Button';
import { useToast } from '../ui/toast/toastContext';
import AssistantAvatar from './AssistantAvatar';
import Markdown from './Markdown';
import SourceList from './SourceList';
import styles from './ChatMessage.module.css';

function CopyButton({ text }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <span className="sr-only" role="status">
        {copied ? 'Answer copied to the clipboard' : ''}
      </span>
    </>
  );
}

// One message. Messages loaded from history render without animation; new
// ones (isNew) fade in once.
function ChatMessage({ message, documentsById, onRetry }) {
  const initial = message.isNew ? 'hidden' : false;

  if (message.role === 'user') {
    const failed = message.status === 'error';
    return (
      <m.div className={styles.user} variants={itemIn} initial={initial} animate="show">
        <div className={cx(styles.userBubble, failed && styles.failed)}>{message.content}</div>
        {failed && (
          <div className={styles.failure} role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{message.error}</span>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => onRetry(message)}>
              Retry
            </Button>
          </div>
        )}
      </m.div>
    );
  }

  return (
    <m.article className={styles.assistant} aria-label="StudyVault’s answer" variants={itemIn} initial={initial} animate="show">
      <AssistantAvatar />
      <div className={styles.answer}>
        <Markdown>{message.content}</Markdown>
        <SourceList sources={message.sources} documentsById={documentsById} animate={message.isNew} />
        <div className={styles.answerActions}>
          <CopyButton text={message.content} />
        </div>
      </div>
    </m.article>
  );
}

export default ChatMessage;
