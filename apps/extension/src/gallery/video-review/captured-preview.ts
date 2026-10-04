import { useCallback, useEffect, useRef, useState } from 'react';

type CapturedPointer = { id: number; node: HTMLElement };

/** Local draft and capture cleanup shared by the two source-frame gesture owners. */
export function useCapturedPreview<Capture extends CapturedPointer, Draft>(
  disabled: boolean | undefined,
  onCancel: () => void
) {
  const drag = useRef<Capture | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const cancellation = useRef(onCancel);
  useEffect(() => {
    cancellation.current = onCancel;
  });
  const release = useCallback(() => {
    const active = drag.current;
    // Capture loss can dispatch synchronously: the old gesture must already be gone.
    drag.current = null;
    if (!active) return;
    cancellation.current();
    if (active.node.hasPointerCapture(active.id)) active.node.releasePointerCapture(active.id);
  }, []);
  const cancel = useCallback(() => {
    release();
    setDraft(null);
  }, [release]);
  useEffect(() => release, [release]);
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [cancel]);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);
  return { drag, draft, setDraft, cancel };
}
