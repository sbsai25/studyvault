import { useLayoutEffect, useRef } from 'react';
import { ArrowUp, Library } from 'lucide-react';
import { displayName } from '../../lib/files';
import IconButton from '../ui/IconButton';
import Select from '../ui/Select';
import styles from './Composer.module.css';

const MAX_HEIGHT = 200;

// Message box. Enter sends, Shift+Enter adds a line. The document selector
// limits the search for the next message to one document.
function Composer({ value, onChange, onSend, sending, documents, scope, onScopeChange, inputRef }) {
  const localRef = useRef(null);
  const textareaRef = inputRef ?? localRef;
  const canSend = value.trim().length > 0 && !sending;

  // Grow with the text, up to MAX_HEIGHT, then scroll
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value, textareaRef]);

  const submit = (event) => {
    event.preventDefault();
    if (canSend) onSend(value);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend(value);
    }
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        className={styles.input}
        rows={1}
        value={value}
        placeholder="Ask about your study materials…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby="chat-input-hint"
      />
      <div className={styles.bar}>
        <Select
          label="Search in"
          hideLabel
          size="sm"
          icon={Library}
          value={scope ?? ''}
          onChange={(e) => onScopeChange(e.target.value ? Number(e.target.value) : null)}
          className={styles.scope}
          disabled={!documents?.length}
        >
          <option value="">All documents</option>
          {documents?.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {displayName(doc.filename)}
            </option>
          ))}
        </Select>
        <span id="chat-input-hint" className={styles.hint}>
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </span>
        <IconButton
          type="submit"
          icon={ArrowUp}
          variant="primary"
          label="Send message"
          disabled={!canSend}
          className={styles.send}
        />
      </div>
    </form>
  );
}

export default Composer;
