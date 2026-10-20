import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, MessagesSquare, SquarePen } from 'lucide-react';
import {
  deleteConversation,
  getConversation,
  getConversations,
  getDocuments,
  renameConversation,
  sendChatMessage,
} from '../api/client';
import { getErrorMessage, isNotFound } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { useMotionPreference } from '../motion/motionPreference';
import ChatEmptyState from '../components/chat/ChatEmptyState';
import ChatMessage from '../components/chat/ChatMessage';
import Composer from '../components/chat/Composer';
import ConversationList from '../components/chat/ConversationList';
import TypingIndicator from '../components/chat/TypingIndicator';
import Page from '../components/layout/Page';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/confirm/confirmContext';
import { useToast } from '../components/ui/toast/toastContext';
import styles from './Chat.module.css';

const NEAR_BOTTOM_PX = 120;

let localMessageId = 0;

function emptyThread(conversationId, nonce = 0) {
  return {
    conversationId,
    title: null,
    messages: [],
    status: conversationId ? 'loading' : 'ready',
    error: null,
    sending: false,
    // Changes whenever a different conversation is shown, so answers that
    // arrive late never land in the wrong thread
    nonce,
  };
}

const fromServer = (message) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  sources: message.sources ?? [],
  status: 'sent',
  isNew: false,
});

function ThreadSkeleton() {
  return (
    <div className={styles.messages} aria-hidden="true">
      <div className={styles.skeletonUser}>
        <Skeleton width="52%" height={44} radius={16} />
      </div>
      <div className={styles.skeletonAnswer}>
        <Skeleton width={32} height={32} radius={10} />
        <div className={styles.skeletonLines}>
          <Skeleton width="92%" />
          <Skeleton width="86%" />
          <Skeleton width="60%" />
        </div>
      </div>
    </div>
  );
}

function Chat() {
  const { conversationId: routeParam } = useParams();
  const routeId = routeParam && /^\d+$/.test(routeParam) ? Number(routeParam) : null;
  const invalidRoute = Boolean(routeParam) && routeId === null;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { reduced } = useMotionPreference();
  const confirm = useConfirm();
  const toast = useToast();

  const conversations = useApi(getConversations, []);
  const documents = useApi(getDocuments, []);
  const documentsById = useMemo(
    () => new Map((documents.data ?? []).map((doc) => [doc.id, doc])),
    [documents.data]
  );

  // ?document=ID limits the search to one document. Ignored once we know
  // the document no longer exists.
  const requestedScope = Number(searchParams.get('document')) || null;
  const scope = documents.data && requestedScope && !documentsById.has(requestedScope) ? null : requestedScope;
  const scopedDocument = scope ? documentsById.get(scope) : null;

  const [thread, setThread] = useState(() => emptyThread(routeId));
  const [draft, setDraft] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  const sendingLock = useRef(false);
  const currentNonce = useRef(thread.nonce);

  // Show a different conversation when the URL changes, except when the URL
  // just caught up with a conversation this thread created
  const [shownRouteId, setShownRouteId] = useState(routeId);
  if (routeId !== shownRouteId) {
    setShownRouteId(routeId);
    if (routeId !== thread.conversationId) {
      setThread((prev) => emptyThread(routeId, prev.nonce + 1));
    }
  }

  useEffect(() => {
    currentNonce.current = thread.nonce;
  }, [thread.nonce]);

  // Load a saved conversation's messages
  const { status: threadStatus, conversationId: threadConversationId, nonce: threadNonce } = thread;
  useEffect(() => {
    if (threadStatus !== 'loading' || !threadConversationId) return;
    let cancelled = false;
    const nonce = threadNonce;
    getConversation(threadConversationId).then(
      (data) => {
        if (cancelled) return;
        setThread((cur) =>
          cur.nonce !== nonce
            ? cur
            : { ...cur, status: 'ready', title: data.title, messages: data.messages.map(fromServer) }
        );
      },
      (error) => {
        if (cancelled) return;
        setThread((cur) => (cur.nonce !== nonce ? cur : { ...cur, status: 'error', error }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [threadStatus, threadConversationId, threadNonce]);

  // Keep the newest message in view, but only if the reader is already at the
  // bottom; never pull them away from older messages they scrolled up to read
  const lastRendered = useRef({ nonce: thread.nonce, count: 0, sending: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const previous = lastRendered.current;
    const count = thread.messages.length;
    lastRendered.current = { nonce: thread.nonce, count, sending: thread.sending };
    const sameThread = previous.nonce === thread.nonce;
    const changed = !sameThread || count !== previous.count || thread.sending !== previous.sending;
    if (!changed) return;

    if (!sameThread || previous.count === 0) {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
      return;
    }

    const last = thread.messages[count - 1];
    const behavior = reduced ? 'auto' : 'smooth';
    if (last?.role === 'user' && last.isNew && count > previous.count) {
      // The reader just sent this: always show it
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else if (atBottom.current) {
      const node = last ? el.querySelector(`[data-message-id="${last.id}"]`) : null;
      if (last?.role === 'assistant' && node) {
        // Long answers: scroll to where the answer starts, not its end
        const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 16;
        el.scrollTo({ top: Math.min(top, el.scrollHeight), behavior });
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
    }
  }, [thread.messages, thread.sending, thread.nonce, reduced]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottom.current = nearBottom;
    setShowJump(!nearBottom);
  };

  const jumpToLatest = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  const upsertConversation = (response) => {
    const now = new Date().toISOString();
    conversations.setData((list = []) => {
      const existing = list.find((c) => c.id === response.conversation_id);
      const updated = existing
        ? { ...existing, updated_at: now }
        : { id: response.conversation_id, title: response.title ?? 'New conversation', created_at: now, updated_at: now };
      return [updated, ...list.filter((c) => c.id !== response.conversation_id)];
    });
  };

  const send = async (text) => {
    const query = text.trim();
    if (!query || sendingLock.current) return;
    sendingLock.current = true;
    const { nonce, conversationId } = thread;
    const userMessage = { id: `local-${++localMessageId}`, role: 'user', content: query, status: 'sent', isNew: true };
    setDraft('');
    setThread((cur) => ({ ...cur, sending: true, messages: [...cur.messages, userMessage] }));

    try {
      const response = await sendChatMessage(query, conversationId, scope);
      const answer = {
        id: `local-${++localMessageId}`,
        role: 'assistant',
        content: response.answer,
        sources: response.sources ?? [],
        status: 'sent',
        isNew: true,
      };
      setThread((cur) =>
        cur.nonce !== nonce
          ? cur
          : {
              ...cur,
              conversationId: response.conversation_id,
              title: response.title ?? cur.title,
              sending: false,
              messages: [...cur.messages, answer],
            }
      );
      upsertConversation(response);
      if (!conversationId && currentNonce.current === nonce) {
        navigate({ pathname: `/chat/${response.conversation_id}`, search: location.search }, { replace: true });
      }
    } catch (error) {
      const message = getErrorMessage(error, 'StudyVault couldn’t answer that. Please try again.');
      setThread((cur) =>
        cur.nonce !== nonce
          ? cur
          : {
              ...cur,
              sending: false,
              messages: cur.messages.map((m) => (m.id === userMessage.id ? { ...m, status: 'error', error: message } : m)),
            }
      );
    } finally {
      sendingLock.current = false;
    }
  };

  const retry = (message) => {
    setThread((cur) => ({ ...cur, messages: cur.messages.filter((m) => m.id !== message.id) }));
    send(message.content);
  };

  const startNewChat = () => {
    setListOpen(false);
    if (routeId) {
      navigate({ pathname: '/chat', search: location.search });
    } else {
      setThread((prev) => emptyThread(null, prev.nonce + 1));
    }
    setDraft('');
    inputRef.current?.focus();
  };

  const changeScope = (documentId) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (documentId) next.set('document', String(documentId));
        else next.delete('document');
        return next;
      },
      { replace: true }
    );
  };

  const handleRename = async (id, title) => {
    try {
      const result = await renameConversation(id, title);
      conversations.setData((list = []) => list.map((c) => (c.id === id ? { ...c, title: result.title } : c)));
      setThread((cur) => (cur.conversationId === id ? { ...cur, title: result.title } : cur));
      return true;
    } catch (error) {
      toast.error("Couldn't rename the conversation", { description: getErrorMessage(error) });
      return false;
    }
  };

  const handleDelete = async (conversation) => {
    const ok = await confirm({
      title: 'Delete this conversation?',
      description: `“${conversation.title}” and all of its messages will be removed. This can’t be undone.`,
      confirmLabel: 'Delete conversation',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteConversation(conversation.id);
      conversations.setData((list = []) => list.filter((c) => c.id !== conversation.id));
      toast.success('Conversation deleted');
      if (conversation.id === thread.conversationId) {
        navigate({ pathname: '/chat', search: location.search });
      }
    } catch (error) {
      toast.error("Couldn't delete the conversation", { description: getErrorMessage(error) });
    }
  };

  const title =
    thread.title ??
    conversations.data?.find((c) => c.id === thread.conversationId)?.title ??
    (thread.conversationId ? 'Conversation' : 'New conversation');

  const conversationList = (
    <ConversationList
      conversations={conversations.data}
      loading={conversations.loading}
      error={conversations.error}
      onRetry={conversations.reload}
      activeId={thread.conversationId}
      onRename={handleRename}
      onDelete={handleDelete}
      onNavigate={() => setListOpen(false)}
    />
  );

  let body;
  if (invalidRoute || (thread.status === 'error' && isNotFound(thread.error))) {
    body = (
      <ErrorState title="Conversation not found" message="It may have been deleted.">
        <Button variant="secondary" size="sm" onClick={startNewChat}>
          Start a new chat
        </Button>
      </ErrorState>
    );
  } else if (thread.status === 'error') {
    body = (
      <ErrorState
        title="Couldn't load this conversation"
        message={getErrorMessage(thread.error)}
        onRetry={() => setThread((cur) => ({ ...cur, status: 'loading', error: null }))}
      />
    );
  } else if (thread.status === 'loading') {
    body = (
      <div aria-busy="true">
        <span className="sr-only">Loading messages</span>
        <ThreadSkeleton />
      </div>
    );
  } else if (thread.messages.length === 0 && !thread.sending) {
    body = (
      <ChatEmptyState
        hasDocuments={documents.data === undefined || documents.data.length > 0}
        scopedDocument={scopedDocument}
        onStart={send}
      />
    );
  } else {
    body = (
      <div className={styles.messages} role="log" aria-label="Messages">
        {thread.messages.map((message) => (
          <div key={message.id} data-message-id={message.id}>
            <ChatMessage message={message} documentsById={documentsById} onRetry={retry} />
          </div>
        ))}
        {thread.sending && <TypingIndicator />}
      </div>
    );
  }

  return (
    <Page title="AI Chat" width="full">
      <div className={styles.chat}>
        <aside className={styles.sidebar} aria-label="Conversations">
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Chats</h2>
            <Button variant="soft" size="sm" icon={SquarePen} onClick={startNewChat}>
              New chat
            </Button>
          </div>
          <div className={styles.sidebarList}>{conversationList}</div>
        </aside>

        <section className={styles.thread}>
          <header className={styles.threadHeader}>
            <Button
              variant="ghost"
              size="sm"
              icon={MessagesSquare}
              className={styles.listToggle}
              onClick={() => setListOpen(true)}
              aria-expanded={listOpen}
            >
              Chats
            </Button>
            <h1 className={styles.threadTitle} title={title}>
              {title}
            </h1>
            <Button variant="ghost" size="sm" icon={SquarePen} className={styles.newChatCompact} onClick={startNewChat}>
              New chat
            </Button>
          </header>

          <div className={styles.scrollArea}>
            <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
              {body}
            </div>
            {showJump && thread.messages.length > 0 && (
              <Button variant="secondary" size="sm" icon={ArrowDown} className={styles.jump} onClick={jumpToLatest}>
                Jump to latest
              </Button>
            )}
          </div>

          <div className={styles.composerArea}>
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              sending={thread.sending}
              documents={documents.data}
              scope={scope}
              onScopeChange={changeScope}
              inputRef={inputRef}
            />
            <p className={styles.disclaimer}>
              Answers are generated from your documents and can be wrong. Check the sources.
            </p>
          </div>
        </section>
      </div>

      <Dialog open={listOpen} onClose={() => setListOpen(false)} variant="sheet" title="Chats">
        <div className={styles.sheet}>
          <Button variant="soft" icon={SquarePen} onClick={startNewChat} block>
            New chat
          </Button>
          {conversationList}
        </div>
      </Dialog>
    </Page>
  );
}

export default Chat;
