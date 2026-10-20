import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Layers, MessagesSquare, Search, SearchX, TextCursorInput, Upload } from 'lucide-react';
import { deleteDocument, getDocuments } from '../api/client';
import { getErrorMessage } from '../lib/errors';
import { fileTypeLabel } from '../lib/files';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import Page from '../components/layout/Page';
import DocumentCard from '../components/library/DocumentCard';
import UploadDropzone from '../components/library/UploadDropzone';
import UploadQueue from '../components/library/UploadQueue';
import { useUploads } from '../components/library/upload/uploadContext';
import { useStudyTools } from '../components/library/useStudyTools';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import TextField from '../components/ui/TextField';
import { useConfirm } from '../components/ui/confirm/confirmContext';
import { useToast } from '../components/ui/toast/toastContext';
import styles from './Library.module.css';

const cardMotion = {
  ...fadeRise,
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.18 } },
};

function LibrarySkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonTop}>
            <Skeleton width={44} height={44} radius={12} />
            <div className={styles.skeletonLines}>
              <Skeleton width="70%" height={16} />
              <Skeleton width="45%" height={12} />
            </div>
          </div>
          <Skeleton width={120} height={32} radius={8} />
        </div>
      ))}
    </div>
  );
}

function Library() {
  const { documentsVersion, openPicker } = useUploads();
  const { data: documents, error, loading, reload, setData } = useApi(getDocuments, [documentsVersion]);
  const { pending, createFlashcards, createFillBlanks } = useStudyTools();
  const confirm = useConfirm();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

  const typeOptions = useMemo(() => {
    const counts = new Map();
    for (const doc of documents ?? []) counts.set(doc.file_type, (counts.get(doc.file_type) ?? 0) + 1);
    return [
      { value: 'all', label: 'All', count: documents?.length ?? 0 },
      ...[...counts.entries()].map(([value, count]) => ({ value, label: fileTypeLabel(value), count })),
    ];
  }, [documents]);

  // A filter for a type that no longer exists (its last document was deleted) falls back to all
  const activeType = typeOptions.some((o) => o.value === type) ? type : 'all';

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (documents ?? []).filter(
      (doc) =>
        (activeType === 'all' || doc.file_type === activeType) &&
        (!needle || doc.filename.toLowerCase().includes(needle))
    );
  }, [documents, query, activeType]);

  const handleDelete = async (doc) => {
    const ok = await confirm({
      title: `Delete ${doc.filename}?`,
      description:
        'Flashcard decks and fill-in-the-blank sets made from this document are deleted too. This can’t be undone.',
      confirmLabel: 'Delete document',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      setData((list) => list.filter((d) => d.id !== doc.id));
      toast.success(`Deleted ${doc.filename}`);
    } catch (err) {
      toast.error(`Couldn't delete ${doc.filename}`, { description: getErrorMessage(err) });
    } finally {
      setDeletingId(null);
    }
  };

  const renderActions = (doc) => {
    const creatingFlashcards = pending?.documentId === doc.id && pending.tool === 'flashcards';
    const creatingExercise = pending?.documentId === doc.id && pending.tool === 'fill-blanks';
    return (
      <>
        <Button variant="soft" size="sm" icon={MessagesSquare} to={`/chat?document=${doc.id}`}>
          Ask AI
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={Layers}
          loading={creatingFlashcards}
          disabled={Boolean(pending)}
          onClick={() => createFlashcards(doc)}
        >
          {creatingFlashcards ? 'Creating flashcards…' : 'Flashcards'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={TextCursorInput}
          loading={creatingExercise}
          disabled={Boolean(pending)}
          onClick={() => createFillBlanks(doc)}
        >
          {creatingExercise ? 'Creating exercise…' : 'Fill in the blanks'}
        </Button>
      </>
    );
  };

  const hasDocuments = documents?.length > 0;
  const filtering = query.trim() !== '' || activeType !== 'all';

  let content;
  if (documents === undefined && loading) {
    content = (
      <div aria-busy="true">
        <span className="sr-only">Loading your documents</span>
        <LibrarySkeleton />
      </div>
    );
  } else if (documents === undefined && error) {
    content = <ErrorState message={getErrorMessage(error)} onRetry={reload} />;
  } else if (!hasDocuments) {
    content = (
      <UploadDropzone
        size="lg"
        title="Add your first study material"
        description="Upload lecture notes, slides or readings. StudyVault indexes the text so you can ask questions about it and turn it into practice."
      />
    );
  } else {
    content = (
      <>
        <div className={styles.toolbar}>
          <TextField
            label="Search documents"
            hideLabel
            icon={Search}
            type="search"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.search}
          />
          {typeOptions.length > 2 && (
            <SegmentedControl
              label="Filter by file type"
              size="sm"
              options={typeOptions}
              value={activeType}
              onChange={setType}
            />
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            size="sm"
            icon={SearchX}
            title="No matching documents"
            description={query.trim() ? `Nothing in your library matches “${query.trim()}”.` : 'No documents of this type.'}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery('');
                setType('all');
              }}
            >
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          <m.ul className={styles.grid} variants={stagger(0.04)} initial="hidden" animate="show">
            <AnimatePresence initial={false}>
              {visible.map((doc) => (
                <m.li key={doc.id} variants={cardMotion} exit="exit">
                  <DocumentCard
                    document={doc}
                    deleting={deletingId === doc.id}
                    onDelete={() => handleDelete(doc)}
                    actions={renderActions(doc)}
                  />
                </m.li>
              ))}
            </AnimatePresence>
          </m.ul>
        )}
        {filtering && visible.length > 0 && (
          <p className={styles.count} role="status">
            Showing {visible.length} of {documents.length}
          </p>
        )}
      </>
    );
  }

  return (
    <Page title="My Library">
      <PageHeader
        title="My Library"
        description="Your uploaded study materials. Every answer and exercise in StudyVault comes from these files."
        actions={
          hasDocuments && (
            <Button icon={Upload} onClick={openPicker}>
              Upload files
            </Button>
          )
        }
      />
      <div className={styles.stack}>
        {hasDocuments && <UploadDropzone size="compact" />}
        <UploadQueue
          renderDoneAction={(item) => (
            <Button variant="soft" size="sm" icon={MessagesSquare} to={`/chat?document=${item.documentId}`}>
              Ask AI
            </Button>
          )}
        />
        {content}
      </div>
    </Page>
  );
}

export default Library;
