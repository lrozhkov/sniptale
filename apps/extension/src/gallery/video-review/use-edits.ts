import type { CompositionJoinSettings } from '../../features/video/project/scene/composition-join';
import { reviewEditInsertionRange } from './range-placement';
import { useRef, useState } from 'react';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import {
  createReviewCut,
  createReviewSpeed,
  placeReviewEditMove,
} from '../../features/video/review/cuts';

type Speed = Extract<ReviewEdit, { kind: 'speed' }>;
/** Each completed gesture or property change writes one reversible history operation. */
export function useReviewEdits(props: {
  duration: number;
  selection?: ReviewAnchor;
  boundaries?: readonly number[];
  snapToKeyframes?: boolean;
  edits: readonly ReviewEdit[];
  onInvalid?(): void;
  pause(): void;
  seek(value: number): void;
  setSelection(value: ReviewAnchor): void;
  commit(before: ReviewEdit | null, after: ReviewEdit | null): Promise<boolean>;
  selectedEditId?: string | null;
  selectedObject?: boolean;
  onSelectedEditIdChange?(id: string | null): void;
}) {
  const pending = useRef(false);
  const [mode, setMode] = useState<'cut' | 'speed' | null>(null);
  const [localSelectedEditId, setLocalSelectedEditId] = useState<string | null>(null);
  const selectedEditId =
    props.selectedEditId === undefined ? localSelectedEditId : props.selectedEditId;
  const setSelectedEditId = (id: string | null) => {
    if (props.selectedEditId === undefined) setLocalSelectedEditId(id);
    props.onSelectedEditIdChange?.(id);
  };
  const [rate, setRate] = useState<Speed['rate']>(2);
  const [audio, setAudio] = useState<Speed['audio']>('speed');
  const selected = props.edits.find((edit) => edit.id === selectedEditId) ?? null;
  const toggle = async (kind: 'cut' | 'speed' = 'cut') => {
    props.pause();
    const selection = props.selection;
    const range = reviewEditInsertionRange(
      kind,
      selection?.kind === 'point' ? selection.time : (selection?.start ?? 0),
      props.duration,
      props.edits,
      selection?.kind === 'range' ? selection : null
    );
    if (range) return commitRange(range, null, kind);
    props.onInvalid?.();
  };
  const candidate = (
    kind: 'cut' | 'speed',
    selection: ReviewAnchor,
    before: ReviewEdit | null = null
  ) => {
    const movedRange =
      before &&
      selection.kind === 'range' &&
      props.snapToKeyframes !== false &&
      Math.abs(selection.end - selection.start - (before.end - before.start)) < 0.000001
        ? placeReviewEditMove({
            current: before,
            requestedStart: selection.start,
            boundaries: props.boundaries ?? [],
            duration: props.duration,
            edits: props.edits,
          })
        : null;
    const range = {
      id: before?.id ?? 'pending-edit',
      selection: movedRange ? { kind: 'range' as const, ...movedRange } : selection,
      boundaries: props.boundaries ?? [],
      snapToKeyframes: props.snapToKeyframes !== false,
      duration: props.duration,
      edits: props.edits.filter((edit) => edit.id !== before?.id),
    };
    return kind === 'speed'
      ? createReviewSpeed({
          ...range,
          rate: before?.kind === 'speed' ? before.rate : rate,
          audio: before?.kind === 'speed' ? before.audio : audio,
        })
      : createReviewCut(range);
  };
  const commitRange = async (
    selection: ReviewAnchor,
    before: ReviewEdit | null = null,
    requestedKind?: 'cut' | 'speed'
  ) => {
    const kind = before?.kind ?? requestedKind ?? mode;
    if (!kind || kind === 'freeze' || pending.current) return false;
    const planned = candidate(kind, selection, before);
    const after = planned && {
      ...planned,
      id: before?.id ?? crypto.randomUUID(),
      ...(before?.kind === 'cut' && before.transition ? { transition: before.transition } : {}),
    };
    if (!after) {
      props.onInvalid?.();
      return false;
    }
    if (before && after.start === before.start && after.end === before.end) return true;
    props.pause();
    pending.current = true;
    try {
      if (await props.commit(before, after)) {
        if (!before) setMode(null);
        if (!before) {
          setSelectedEditId(after.id);
          props.setSelection({ kind: 'point', time: after.start });
          props.seek(after.start);
        }
        return true;
      }
      return false;
    } finally {
      pending.current = false;
    }
  };

  const changeFreezeDuration = (edit: ReviewEdit, duration: number) => {
    if (edit.kind !== 'freeze' || !Number.isFinite(duration) || duration < 0.04 || duration > 600)
      return;
    props.pause();
    return props.commit(edit, { ...edit, duration });
  };

  return {
    mode,
    cutting: mode !== null,
    rate,
    audio,
    changeRate: setRate,
    changeAudio: setAudio,
    changeSelectedRate: (value: Speed['rate']) =>
      selected?.kind === 'speed' ? props.commit(selected, { ...selected, rate: value }) : undefined,
    changeSelectedAudio: (value: Speed['audio']) =>
      selected?.kind === 'speed'
        ? props.commit(selected, { ...selected, audio: value })
        : undefined,
    selected,
    moveFreeze: (edit: ReviewEdit, time: number) => {
      if (
        edit.kind !== 'freeze' ||
        !Number.isFinite(time) ||
        time < 0 ||
        time > props.duration ||
        props.edits.some((item) => item.kind === 'cut' && item.start <= time && time < item.end)
      )
        return;
      props.pause();
      if (Math.abs(edit.start - time) < 1e-7) return;
      return props.commit(edit, {
        ...edit,
        start: time,
        end: time,
        requestedStart: time,
        requestedEnd: time,
      });
    },
    changeFreezeDuration,
    changeSelectedFreezeDuration: (duration: number) =>
      selected ? changeFreezeDuration(selected, duration) : undefined,
    changeSelectedTransition: (transition: CompositionJoinSettings | null) => {
      if (selected?.kind !== 'cut') return undefined;
      props.pause();
      const cut = { ...selected };
      delete cut.transition;
      return props.commit(selected, transition ? { ...cut, transition } : cut);
    },
    commitRange,
    apply: (kind: 'cut' | 'speed', selection: ReviewAnchor) => commitRange(selection, null, kind),
    canApply: (kind: 'cut' | 'speed', selection: ReviewAnchor) => !!candidate(kind, selection),
    setCutting: (value: boolean) => {
      setMode(value ? 'cut' : null);
    },
    select: (edit: ReviewEdit) => {
      props.pause();
      setSelectedEditId(edit.id);
      props.setSelection(
        edit.kind === 'freeze'
          ? { kind: 'point', time: edit.start }
          : { kind: 'range', start: edit.start, end: edit.end }
      );
    },
    toggle,
    remove: () => {
      if (selected) return props.commit(selected, null);
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
