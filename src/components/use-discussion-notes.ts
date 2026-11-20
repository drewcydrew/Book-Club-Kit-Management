import { useEffect, useState } from 'react';
import { loadDiscussionNotes } from '../state/api';

export const NO_DISCUSSION_NOTES = 'No discussion notes stored.';
const LOAD_FAILED = 'Discussion notes could not be loaded.';

export function useDiscussionNotes(titleId: string): string {
  const [result, setResult] = useState<{ titleId: string; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadDiscussionNotes(titleId, controller.signal)
      .then((notes) => setResult({ titleId, text: notes.notes.trim() ? notes.notes : NO_DISCUSSION_NOTES }))
      .catch(() => { if (!controller.signal.aborted) setResult({ titleId, text: LOAD_FAILED }); });
    return () => controller.abort();
  }, [titleId]);

  return result?.titleId === titleId ? result.text : 'Loading discussion notes…';
}
