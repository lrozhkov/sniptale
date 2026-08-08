import { useCallback, useEffect, useRef, useState } from 'react';
import { arePaintsEqual, clonePaint, type Paint } from '@sniptale/foundation/paint';
import type { PaintSelectorTransactionOptions } from './types';

export function usePaintSelectorState(options: PaintSelectorTransactionOptions) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => clonePaint(options.value));
  const [selectedStopId, setSelectedStopId] = useState<string | null>(() =>
    options.value.kind === 'gradient' ? (options.value.gradient.stops[0]?.id ?? null) : null
  );
  const valueRef = useRef(options.value);

  useEffect(() => {
    const next = clonePaint(options.value);
    if (arePaintsEqual(valueRef.current, next)) return;
    valueRef.current = next;
    setDraft(next);
    setSelectedStopId(next.kind === 'gradient' ? (next.gradient.stops[0]?.id ?? null) : null);
  }, [options.value]);

  const preview = useCallback(
    (paint: Paint) => {
      const next = clonePaint(paint);
      setDraft(next);
      options.onPreviewChange?.(clonePaint(next));
    },
    [options]
  );
  const cancel = useCallback(() => {
    const current = clonePaint(valueRef.current);
    setDraft(current);
    options.onPreviewReset?.(current);
    setOpen(false);
  }, [options]);
  const apply = useCallback(() => {
    const next = clonePaint(draft);
    valueRef.current = next;
    options.onChange(next);
    setOpen(false);
  }, [draft, options]);
  const show = useCallback(() => {
    setDraft(clonePaint(valueRef.current));
    setOpen(true);
  }, []);

  return { apply, cancel, draft, open, preview, selectedStopId, setOpen, setSelectedStopId, show };
}
