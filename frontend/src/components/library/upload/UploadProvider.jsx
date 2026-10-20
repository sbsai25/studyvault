import { useCallback, useMemo, useRef, useState } from 'react';
import { uploadDocument } from '../../../api/client';
import { getErrorMessage } from '../../../lib/errors';
import { ACCEPT_ATTRIBUTE, validateFile } from '../../../lib/files';
import { useToast } from '../../ui/toast/toastContext';
import { UploadContext } from './uploadContext';

let nextId = 1;

const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;

// Holds the upload queue for the whole signed-in app, so uploads keep going
// while the user moves between screens. Files upload one at a time.
//
// Item status: queued -> uploading (bytes being sent; real progress) ->
// processing (server extracting and indexing; duration unknown) -> done | error
function UploadProvider({ children }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  // Bumped after every successful upload so document lists know to refresh
  const [documentsVersion, setDocumentsVersion] = useState(0);
  const queue = useRef([]);
  const running = useRef(false);
  // Files currently queued or uploading, to ignore accidental double drops
  const activeKeys = useRef(new Set());
  const inputRef = useRef(null);

  const update = useCallback((id, patch) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const { id, file, key } = queue.current.shift();
      update(id, { status: 'uploading' });
      try {
        const result = await uploadDocument(file, {
          onProgress: (fraction) =>
            update(id, fraction >= 1 ? { status: 'processing', progress: 1 } : { progress: fraction }),
        });
        update(id, {
          status: 'done',
          progress: 1,
          documentId: result.document_id,
          passages: result.chunks_count,
        });
        setDocumentsVersion((v) => v + 1);
        toast.success(`${file.name} is ready`, {
          description: `Indexed into ${result.chunks_count} passage${result.chunks_count === 1 ? '' : 's'}.`,
        });
      } catch (error) {
        const message = getErrorMessage(error, 'The upload failed. Please try again.');
        update(id, { status: 'error', error: message });
        toast.error(`${file.name} wasn't uploaded`, { description: message });
      } finally {
        activeKeys.current.delete(key);
      }
    }
    running.current = false;
  }, [toast, update]);

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;

      const added = [];
      for (const file of files) {
        const key = fileKey(file);
        if (activeKeys.current.has(key)) {
          toast.info(`${file.name} is already uploading`);
          continue;
        }
        const item = { id: nextId++, name: file.name, size: file.size, progress: null, error: null };
        const problem = validateFile(file);
        if (problem) {
          added.push({ ...item, status: 'error', error: problem });
          continue;
        }
        activeKeys.current.add(key);
        queue.current.push({ id: item.id, file, key });
        added.push({ ...item, status: 'queued' });
      }
      if (added.length > 0) setItems((list) => [...list, ...added]);

      const rejected = added.filter((item) => item.status === 'error');
      if (rejected.length === 1) {
        toast.error(`${rejected[0].name} can't be uploaded`, { description: rejected[0].error });
      } else if (rejected.length > 1) {
        toast.error(`${rejected.length} files can't be uploaded`, {
          description: 'The upload list shows the reason for each.',
        });
      }
      pump();
    },
    [pump, toast]
  );

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((item) => item.id !== id || !['done', 'error'].includes(item.status)));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((list) => list.filter((item) => !['done', 'error'].includes(item.status)));
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const value = useMemo(
    () => ({ items, documentsVersion, addFiles, openPicker, dismiss, clearFinished }),
    [items, documentsVersion, addFiles, openPicker, dismiss, clearFinished]
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      {/* One shared file input; buttons anywhere call openPicker() */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="upload-input"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </UploadContext.Provider>
  );
}

export default UploadProvider;
