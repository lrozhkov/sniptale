import { useEffect, useRef } from 'react';
import { type GradientType, type Paint, type PaintStopIdFactory } from '@sniptale/foundation/paint';
import { switchPaintMode } from '@sniptale/ui/paint-selector/operations';

export function usePaintModeState(options: {
  createId: PaintStopIdFactory;
  draft: Paint;
  externalValue: Paint;
  preview: (paint: Paint) => void;
  selectStop: (id: string | null) => void;
}) {
  const solidDraftRef = useRef(options.draft.kind === 'solid' ? options.draft : null);
  const gradientDraftRef = useRef(options.draft.kind === 'gradient' ? options.draft : null);
  useEffect(() => {
    if (options.draft.kind === 'solid') solidDraftRef.current = options.draft;
    else gradientDraftRef.current = options.draft;
  }, [options.draft]);
  useEffect(() => {
    if (options.externalValue.kind === 'solid') {
      solidDraftRef.current = options.externalValue;
      gradientDraftRef.current = null;
    } else {
      gradientDraftRef.current = options.externalValue;
      solidDraftRef.current = null;
    }
  }, [options.externalValue]);

  return (next: 'solid' | GradientType) => {
    const paint =
      next === 'solid'
        ? (solidDraftRef.current ?? switchPaintMode(options.draft, next, options.createId))
        : gradientDraftRef.current
          ? switchPaintMode(gradientDraftRef.current, next, options.createId)
          : switchPaintMode(options.draft, next, options.createId);
    options.preview(paint);
    options.selectStop(paint.kind === 'gradient' ? (paint.gradient.stops[0]?.id ?? null) : null);
  };
}
