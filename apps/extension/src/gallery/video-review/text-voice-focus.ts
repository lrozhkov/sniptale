import { useEffect, useRef, useState } from 'react';

/** Temporary voice mode returns to the corresponding newly rendered text trigger. */
export function useReviewTextVoiceMode<T extends HTMLElement>() {
  const [ids, setIds] = useState<readonly string[] | null>(null);
  const root = useRef<T>(null);
  const returnKey = useRef<string | null>(null);
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
    open: (selected: readonly string[], key: string) => {
      returnKey.current = key;
      setIds([...selected]);
    },
    close: () => setIds(null),
  };
}
