import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, Pencil, Trash2 } from 'lucide-react';
import { cx } from '../../lib/cx';
import { formatRelative } from '../../lib/dates';
import { getErrorMessage } from '../../lib/errors';
import ErrorState from '../ui/ErrorState';
import IconButton from '../ui/IconButton';
import { Skeleton } from '../ui/Skeleton';
import styles from './ConversationList.module.css';

function ConversationItem({ conversation, active, onRename, onDelete, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    cancelled.current = false;
    setDraft(conversation.title);
    setEditing(true);
  };

  const save = async () => {
    if (cancelled.current || saving) return;
    const title = draft.trim();
    if (!title || title === conversation.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRename(conversation.id, title);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <li className={cx(styles.item, styles.editing)}>
        <input
          ref={inputRef}
          className={styles.renameInput}
          value={draft}
          maxLength={255}
          aria-label="Conversation title"
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              // Don't let Escape also close a surrounding drawer
              e.preventDefault();
              e.stopPropagation();
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }

  return (
    <li className={cx(styles.item, active && styles.active)}>
      <Link
        to={`/chat/${conversation.id}`}
        className={styles.link}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className={styles.title}>{conversation.title}</span>
        <span className={styles.time}>{formatRelative(conversation.updated_at)}</span>
      </Link>
      <div className={styles.actions}>
        <IconButton icon={Pencil} size="sm" label={`Rename “${conversation.title}”`} onClick={startEditing} />
        <IconButton
          icon={Trash2}
          size="sm"
          variant="danger"
          label={`Delete “${conversation.title}”`}
          onClick={() => onDelete(conversation)}
        />
      </div>
    </li>
  );
}

// Saved conversations, most recently active first
function ConversationList({ conversations, loading, error, onRetry, activeId, onRename, onDelete, onNavigate }) {
  if (conversations === undefined && loading) {
    return (
      <div className={styles.loading} aria-busy="true">
        <span className="sr-only">Loading conversations</span>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.skeletonRow} aria-hidden="true">
            <Skeleton width={`${80 - i * 8}%`} height={13} />
            <Skeleton width="30%" height={10} />
          </div>
        ))}
      </div>
    );
  }

  if (conversations === undefined && error) {
    return <ErrorState size="sm" titleAs="h3" title="Couldn't load chats" message={getErrorMessage(error)} onRetry={onRetry} />;
  }

  if (!conversations?.length) {
    return (
      <div className={styles.empty}>
        <MessagesSquare size={20} aria-hidden="true" />
        <p>Your conversations will appear here.</p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeId}
          onRename={onRename}
          onDelete={onDelete}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

export default ConversationList;
