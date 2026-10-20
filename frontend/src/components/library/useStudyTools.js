import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateFillBlanks, generateFlashcards } from '../../api/client';
import { getErrorMessage } from '../../lib/errors';
import { useIsMounted } from '../../lib/useIsMounted';
import { useToast } from '../ui/toast/toastContext';

// Creates study material from a document. Generation takes a while, so only
// one runs at a time; if the user has left the screen by the time it
// finishes, a toast offers to open the result instead of navigating.
export function useStudyTools() {
  const navigate = useNavigate();
  const toast = useToast();
  const isMounted = useIsMounted();
  const busy = useRef(false);
  // { documentId, tool } while a generation is running
  const [pending, setPending] = useState(null);

  const run = useCallback(
    async (tool, document, request, onDone) => {
      if (busy.current) return;
      busy.current = true;
      setPending({ documentId: document.id, tool });
      try {
        const result = await request();
        onDone(result);
      } catch (error) {
        toast.error(`Couldn't create ${tool === 'flashcards' ? 'flashcards' : 'the exercise'}`, {
          description: getErrorMessage(error),
        });
      } finally {
        busy.current = false;
        if (isMounted()) setPending(null);
      }
    },
    [isMounted, toast]
  );

  const createFlashcards = useCallback(
    (document) =>
      run('flashcards', document, () => generateFlashcards(document.id), (result) => {
        const path = `/flashcards/${result.flashcard_set_id}/success`;
        const state = { title: result.title, numberOfCards: result.number_of_cards, documentId: document.id };
        if (isMounted()) {
          navigate(path, { state });
        } else {
          toast.success(`Flashcards ready: ${result.title}`, {
            action: { label: 'Open deck', onClick: () => navigate(path, { state }) },
          });
        }
      }),
    [isMounted, navigate, run, toast]
  );

  // count: number of sentences, 3-20 (the API's default is 10)
  const createFillBlanks = useCallback(
    (document, count) =>
      run('fill-blanks', document, () => generateFillBlanks(document.id, count), (result) => {
        const path = `/fill-blanks/${result.fill_blank_set_id}`;
        if (isMounted()) {
          navigate(path);
        } else {
          toast.success(`Exercise ready: ${result.title}`, {
            action: { label: 'Start', onClick: () => navigate(path) },
          });
        }
      }),
    [isMounted, navigate, run, toast]
  );

  return { pending, createFlashcards, createFillBlanks };
}
