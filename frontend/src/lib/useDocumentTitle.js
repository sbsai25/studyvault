import { useEffect } from 'react';

// Sets the browser tab title, e.g. "My Library · StudyVault"
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · StudyVault` : 'StudyVault';
  }, [title]);
}
