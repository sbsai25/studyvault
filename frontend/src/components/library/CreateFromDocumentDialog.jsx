import { useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { getDocuments } from '../../api/client';
import { getErrorMessage } from '../../lib/errors';
import { displayName } from '../../lib/files';
import { useApi } from '../../lib/useApi';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Select from '../ui/Select';
import Spinner from '../ui/Spinner';
import styles from './CreateFromDocumentDialog.module.css';

const TOOLS = {
  flashcards: {
    title: 'Create flashcards',
    description: 'StudyVault reads the document and writes question-and-answer cards from it.',
    submit: 'Create flashcards',
    submitting: 'Creating flashcards…',
  },
  'fill-blanks': {
    title: 'Create a fill-in-the-blank exercise',
    description: 'StudyVault picks key sentences and blanks out one important word or phrase in each.',
    submit: 'Create exercise',
    submitting: 'Creating exercise…',
  },
};

function CreateForm({ tool, pending, onCreate, onCancel, renderOptions }) {
  const documents = useApi(getDocuments, []);
  const [documentId, setDocumentId] = useState(null);
  const config = TOOLS[tool];
  const busy = Boolean(pending);

  if (documents.data === undefined && documents.loading) {
    return (
      <div className={styles.loading}>
        <Spinner size={20} label="Loading your documents" />
      </div>
    );
  }
  if (documents.data === undefined && documents.error) {
    return <ErrorState size="sm" titleAs="h3" message={getErrorMessage(documents.error)} onRetry={documents.reload} />;
  }
  if (documents.data.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={FileText}
        titleAs="h3"
        title="Upload a document first"
        description="Study material is made from the documents in your library."
      >
        <Button to="/library" icon={Upload} size="sm">
          Go to My Library
        </Button>
      </EmptyState>
    );
  }

  const selectedId = documentId ?? documents.data[0].id;
  const selected = documents.data.find((d) => d.id === selectedId) ?? documents.data[0];

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onCreate(selected);
      }}
    >
      <Select label="Document" value={selectedId} onChange={(e) => setDocumentId(Number(e.target.value))} disabled={busy}>
        {documents.data.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {displayName(doc.filename)}
          </option>
        ))}
      </Select>
      {renderOptions?.({ disabled: busy })}
      <p className={styles.note} role={busy ? 'status' : undefined}>
        {busy
          ? 'Writing your study material. This can take a little while; you can close this window and it will open when ready.'
          : 'Generation uses AI, so check anything that looks off.'}
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {busy ? 'Close' : 'Cancel'}
        </Button>
        <Button type="submit" loading={busy}>
          {busy ? config.submitting : config.submit}
        </Button>
      </div>
    </form>
  );
}

// Choose a document to generate flashcards or an exercise from.
// tool: flashcards | fill-blanks. onCreate(document) starts the generation;
// renderOptions adds tool-specific fields (e.g. the number of questions).
function CreateFromDocumentDialog({ open, onClose, tool, pending, onCreate, renderOptions }) {
  const config = TOOLS[tool];
  // Closing doesn't cancel a running generation: the result still opens (or
  // a notification offers it) when it's ready
  return (
    <Dialog open={open} onClose={onClose} title={config.title} description={config.description} size="md">
      <CreateForm tool={tool} pending={pending} onCreate={onCreate} onCancel={onClose} renderOptions={renderOptions} />
    </Dialog>
  );
}

export default CreateFromDocumentDialog;
