import { useEffect, useRef, type MutableRefObject } from 'react';
import { type GradientType, type Paint, type PaintStopIdFactory } from '@sniptale/foundation/paint';
import { switchPaintMode } from '@sniptale/ui/paint-selector/operations';

type Mode = 'solid' | GradientType;
export type PaintModeDrafts = Partial<Record<Mode, Paint>>;
const modeOf = (paint: Paint): Mode => (paint.kind === 'solid' ? 'solid' : paint.gradient.type);

export function usePaintModeState(options: {
  createId: PaintStopIdFactory;
  draft: Paint;
  externalValue: Paint;
  open?: boolean;
  modeDrafts?: MutableRefObject<PaintModeDrafts>;
  preview: (paint: Paint) => void;
  selectStop: (id: string | null) => void;
}) {
  const localDrafts = useRef<PaintModeDrafts>({ [modeOf(options.draft)]: options.draft });
  const drafts = options.modeDrafts ?? localDrafts;
  useEffect(() => {
    drafts.current[modeOf(options.draft)] = options.draft;
  }, [options.draft, drafts]);
  useEffect(() => {
    drafts.current = { [modeOf(options.externalValue)]: options.externalValue };
  }, [options.externalValue, options.open, drafts]);

  return (next: Mode) => {
    drafts.current[modeOf(options.draft)] = options.draft;
    const paint = drafts.current[next] ?? switchPaintMode(options.draft, next, options.createId);
    options.preview(paint);
    options.selectStop(paint.kind === 'gradient' ? (paint.gradient.stops[0]?.id ?? null) : null);
  };
}
