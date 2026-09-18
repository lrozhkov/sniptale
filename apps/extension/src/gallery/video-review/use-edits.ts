import { useState } from 'react';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import { createReviewCut, createReviewSpeed } from '../../features/video/review/cuts';

type Speed = Extract<ReviewEdit, { kind: 'speed' }>;
/** Each completed gesture or property change writes one reversible history operation. */
export function useReviewEdits(props: {
  duration: number;
  boundaries?: readonly number[];
  edits: readonly ReviewEdit[];
  onInvalid?(): void;
  pause(): void;
  seek(value: number): void;
  setSelection(value: ReviewAnchor): void;
  commit(before: ReviewEdit | null, after: ReviewEdit | null): Promise<boolean>;
}) {
  const [mode, setMode] = useState<'cut' | 'speed' | null>(null);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [rate, setRate] = useState<Speed['rate']>(2);
  const [audio, setAudio] = useState<Speed['audio']>('speed');
  const selected = props.edits.find((edit) => edit.id === selectedEditId) ?? null;
  const toggle = (kind: 'cut' | 'speed' = 'cut') => {
    props.pause();
    setMode(mode === kind ? null : kind);
    setSelectedEditId(null);
  };
  const commitRange = async (selection: ReviewAnchor, before: ReviewEdit | null = null) => {
    const kind = before?.kind ?? mode;
    if (!kind || !props.boundaries) return;
    const range = {
      id: before?.id ?? crypto.randomUUID(),
      selection,
      boundaries: props.boundaries,
      duration: props.duration,
      edits: props.edits.filter((edit) => edit.id !== before?.id),
    };
    const after =
      kind === 'speed'
        ? createReviewSpeed({
            ...range,
            rate: before?.kind === 'speed' ? before.rate : rate,
            audio: before?.kind === 'speed' ? before.audio : audio,
          })
        : createReviewCut(range);
    if (!after) {
      props.onInvalid?.();
      return;
    }
    if (before && after.start === before.start && after.end === before.end) return;
    if (await props.commit(before, after)) {
      setSelectedEditId(after.id);
      props.setSelection({ kind: 'point', time: after.start });
    }
  };
  return {
    mode,
    cutting: mode !== null,
    rate: selected?.kind === 'speed' ? selected.rate : rate,
    audio: selected?.kind === 'speed' ? selected.audio : audio,
    changeRate: async (value: Speed['rate']) => {
      if (
        selected?.kind !== 'speed' ||
        (await props.commit(selected, { ...selected, rate: value }))
      )
        setRate(value);
    },
    changeAudio: async (value: Speed['audio']) => {
      if (
        selected?.kind !== 'speed' ||
        (await props.commit(selected, { ...selected, audio: value }))
      )
        setAudio(value);
    },
    selected,
    commitRange,
    setCutting: (value: boolean) => {
      setMode(value ? 'cut' : null);
      setSelectedEditId(null);
    },
    select: (edit: ReviewEdit) => {
      props.pause();
      setSelectedEditId(edit.id);
      setMode(edit.kind);
      if (edit.kind === 'speed') {
        setRate(edit.rate);
        setAudio(edit.audio);
      }
      props.setSelection({ kind: 'range', start: edit.start, end: edit.end });
      props.seek(edit.start);
    },
    toggle,
    remove: () => {
      if (selected) void props.commit(selected, null);
    },
  };
}

/** Commits one edit range; export phases and unfinished comments block the write. */
export async function commitReviewEdit(args: {
  session: {
    commit(operation: {
      id: string;
      at: number;
      target: 'edit';
      before: ReviewEdit | null;
      after: ReviewEdit | null;
    }): Promise<unknown>;
  };
  run(action: () => Promise<unknown>): Promise<unknown>;
  busy: boolean;
  exporterPhase: string;
  canStart(): boolean;
  before: ReviewEdit | null;
  after: ReviewEdit | null;
}): Promise<boolean> {
  if (args.busy || args.exporterPhase !== 'idle' || !args.canStart()) return false;
  let committed = false;
  await args.run(async () => {
    await args.session.commit({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'edit',
      before: args.before,
      after: args.after,
    });
    committed = true;
  });
  return committed;
}
