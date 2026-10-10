import { useEffect, useRef, useState } from 'react';

/** Temporary voice mode returns to the corresponding newly rendered text trigger. */
export function useReviewTextFormMode<T extends HTMLElement>(scope?: string) {
  const [ids, setIds] = useState<readonly string[] | null>(null);
  const [kind, setKind] = useState<'voice' | 'rewrite' | 'subtitles'>('voice');
  const [wholeDocument, setWholeDocument] = useState(false);
  const root = useRef<T>(null);
  const returnKey = useRef<string | null>(null);
  useEffect(() => {
    returnKey.current = null;
    setIds(null);
  }, [scope]);
  useEffect(() => {
    if (ids || returnKey.current === null) return;
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>(
      'button[data-text-voice-trigger]:not(:disabled)'
    );
    const trigger =
      buttons &&
      [...buttons].find((button) => button.dataset['textVoiceTrigger'] === returnKey.current);
    const fallback = root.current?.querySelector<HTMLElement>(
      'textarea:not(:disabled), input:not(:disabled):not([type="checkbox"]), button:not(:disabled)'
    );
    (trigger ?? fallback)?.focus();
    returnKey.current = null;
  }, [ids]);
  return {
    root,
    ids,
    kind,
    wholeDocument,
    open: (
      selected: readonly string[],
      key: string,
      form: 'voice' | 'rewrite' | 'subtitles' = 'voice',
      whole = false
    ) => {
      returnKey.current = key;
      setKind(form);
      setWholeDocument(whole);
      setIds([...selected]);
    },
    close: () => setIds(null),
  };
}
