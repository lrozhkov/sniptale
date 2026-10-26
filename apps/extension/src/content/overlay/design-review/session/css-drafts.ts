import { useCallback, useEffect, useRef, useState } from 'react';

interface CssDraft {
  target: Element;
  label: string;
  text: string;
  acceptedText: string;
}

/** Keeps unapplied text tied to its original target for one review-session lifetime. */
export function useDesignReviewCssDrafts(enabled: boolean) {
  const entries = useRef(new Map<Element, CssDraft>());
  const cancelEditor = useRef<(() => boolean) | null>(null);
  const [revision, setRevision] = useState(0);
  const publish = useCallback(() => setRevision((value) => value + 1), []);
  const read = useCallback(
    (target: Element | null) => (target ? (entries.current.get(target)?.text ?? '') : ''),
    []
  );
  const write = useCallback(
    (target: Element, label: string, text: string) => {
      const before = entries.current.get(target);
      if (before?.text === text) return;
      entries.current.set(target, {
        target,
        label,
        text,
        acceptedText: before?.acceptedText ?? '',
      });
      publish();
    },
    [publish]
  );
  const accept = useCallback(
    (target: Element) => {
      const draft = entries.current.get(target);
      if (!draft) return;
      entries.current.set(target, { ...draft, acceptedText: draft.text });
      publish();
    },
    [publish]
  );
  const discard = useCallback(
    (target: Element) => {
      if (entries.current.delete(target)) publish();
    },
    [publish]
  );
  const registerEditorCancel = useCallback((cancel: () => boolean) => {
    cancelEditor.current = cancel;
    return () => {
      if (cancelEditor.current === cancel) cancelEditor.current = null;
    };
  }, []);
  const cancelEditing = useCallback(() => cancelEditor.current?.() ?? false, []);
  useEffect(() => {
    if (enabled || !entries.current.size) return;
    entries.current.clear();
    cancelEditor.current = null;
    publish();
  }, [enabled, publish]);
  return {
    read,
    write,
    accept,
    discard,
    registerEditorCancel,
    cancelEditing,
    items: Array.from(entries.current.values()).filter(
      (draft) => draft.text !== draft.acceptedText
    ),
    revision,
  };
}
