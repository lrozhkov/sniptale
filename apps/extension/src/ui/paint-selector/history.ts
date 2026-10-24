import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { PaintModeDrafts } from './mode-state';
import { arePaintsEqual, clonePaint, type Paint } from '@sniptale/foundation/paint';

type Snapshot = { paint: Paint; selected: string | null; modes: PaintModeDrafts };

/** One local history entry per pointer gesture or focused text edit. */
export function usePaintHistory(options: {
  modeDrafts?: MutableRefObject<PaintModeDrafts>;
  draft: Paint;
  open: boolean;
  selected: string | null;
  preview: (paint: Paint) => void;
  select: (id: string | null) => void;
}) {
  const current = useRef(options);
  current.current = options;
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const grouping = useRef(false);
  const groupRecorded = useRef(false);
  const [, refresh] = useState(0);
  const update = () => refresh((value) => value + 1);
  useEffect(() => {
    past.current = [];
    future.current = [];
    grouping.current = false;
    groupRecorded.current = false;
    update();
  }, [options.open]);
  const snapshot = (): Snapshot => ({
    paint: clonePaint(current.current.draft),
    selected: current.current.selected,
    modes: structuredClone(current.current.modeDrafts?.current ?? {}),
  });
  const begin = () => {
    grouping.current = true;
    groupRecorded.current = false;
  };
  const end = () => {
    grouping.current = false;
    groupRecorded.current = false;
  };
  const preview = (paint: Paint) => {
    if (arePaintsEqual(current.current.draft, paint)) return;
    if (!grouping.current || !groupRecorded.current) {
      past.current.push(snapshot());
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      groupRecorded.current = true;
    }
    current.current.preview(paint);
    update();
  };
  const travel = (source: Snapshot[], destination: Snapshot[]) => {
    const next = source.pop();
    if (!next) return;
    destination.push(snapshot());
    end();
    if (current.current.modeDrafts)
      current.current.modeDrafts.current = structuredClone(next.modes);
    current.current.preview(clonePaint(next.paint));
    current.current.select(next.selected);
    update();
  };
  return {
    preview,
    begin,
    end,
    undo: () => travel(past.current, future.current),
    redo: () => travel(future.current, past.current),
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
