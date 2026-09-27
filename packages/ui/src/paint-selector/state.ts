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
  const previewRef = useRef<Paint | null>(null);

  useEffect(() => {
    const next = clonePaint(options.value);
    if (open && previewRef.current && arePaintsEqual(previewRef.current, next)) return;
    if (arePaintsEqual(valueRef.current, next)) return;
    valueRef.current = next;
    previewRef.current = null;
    setDraft(next);
    setSelectedStopId((current) =>
      next.kind === 'gradient'
        ? (next.gradient.stops.find((stop) => stop.id === current)?.id ??
          next.gradient.stops[0]?.id ??
          null)
        : null
    );
  }, [open, options.value]);

  const preview = useCallback(
    (paint: Paint) => {
      const next = clonePaint(paint);
      previewRef.current = next;
      setDraft(next);
      options.onPreviewChange?.(clonePaint(next));
    },
    [options]
  );
  const cancel = useCallback(() => {
    const current = clonePaint(valueRef.current);
    previewRef.current = null;
    setDraft(current);
    options.onPreviewReset?.(current);
    setOpen(false);
  }, [options]);
  const apply = useCallback(() => {
    const next = clonePaint(draft);
    previewRef.current = null;
    valueRef.current = next;
    options.onChange(next);
    setOpen(false);
  }, [draft, options]);
  const show = useCallback(() => {
    previewRef.current = null;
    setDraft(clonePaint(valueRef.current));
    setOpen(true);
  }, []);

  return { apply, cancel, draft, open, preview, selectedStopId, setOpen, setSelectedStopId, show };
}
