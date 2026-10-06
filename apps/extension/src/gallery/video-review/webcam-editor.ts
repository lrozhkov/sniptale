import { useEffect, useRef, useState } from 'react';
import {
  createQuickEditWebcam,
  parseQuickEditWebcam,
  quickEditWebcamPlacementAt,
  type QuickEditWebcam,
  type QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import type { ReviewSelection } from '../../features/video/review/types';
import {
  attachReviewWebcam,
  findReviewWebcam,
  recoverReviewWebcam,
} from '../../workflows/video-review/webcam-source';
import type { useReviewAdvanced } from './use-advanced';
import type { LoadedReview } from './use-session';

type ReviewWebcamSelection = Extract<
  ReviewSelection,
  {
    kind: 'webcam' | 'webcam-position' | 'webcam-hidden';
  }
>;

/** Deletion retains camera bytes through history; intervals and placements never delete main time. */
export function removeReviewWebcamItem(
  camera: QuickEditWebcam,
  selection: ReviewWebcamSelection
): QuickEditWebcam {
  if (selection.kind === 'webcam') return { ...camera, enabled: false };
  if (selection.kind === 'webcam-position')
    return { ...camera, positions: camera.positions.filter((item) => item.id !== selection.id) };
  return {
    ...camera,
    hiddenRanges: camera.hiddenRanges.filter((item) => item.id !== selection.id),
  };
}

type WebcamEditorArgs = {
  session: LoadedReview['session'];
  advanced: ReturnType<typeof useReviewAdvanced>;
  scene: { width: number; height: number };
  sourceDuration: number;
  time: number;
  selection: ReviewSelection;
  select(selection: ReviewSelection): void;
  pause(): void;
  seek(time: number): void;
  allowed(): boolean;
};

/** Authored camera edits use the existing history writer and selection authority. */
export function useReviewWebcamEditor(args: WebcamEditorArgs) {
  const camera = args.advanced.advanced.webcam;
  const latest = useRef(args);
  latest.current = args;
  const acquisition = useReviewWebcamAcquisition(args);

  const mutate = (update: (camera: QuickEditWebcam) => QuickEditWebcam) => {
    if (!latest.current.allowed() || acquisition.busy()) return;
    latest.current.advanced.setWebcam((current) =>
      current ? (parseQuickEditWebcam(update(current)) ?? current) : current
    );
  };
  const choose = (selection: ReviewWebcamSelection) => {
    if (!latest.current.allowed()) return;
    latest.current.pause();
    latest.current.select(selection);
  };
  const toggle = async () => {
    if (!latest.current.allowed() || acquisition.busy()) return;
    if (!camera) return acquisition.attach();
    mutate((current) => ({ ...current, enabled: !current.enabled }));
    if (!camera.enabled) choose({ kind: 'webcam' });
  };
  const selectedPosition = camera?.positions.find(
    (item) => args.selection.kind === 'webcam-position' && item.id === args.selection.id
  );
  const hidden = camera?.hiddenRanges.find(
    (item) => args.selection.kind === 'webcam-hidden' && item.id === args.selection.id
  );
  const placement = selectedPosition?.placement ?? camera?.placement;
  const canHide = (range: { start: number; end: number }, replace = false) =>
    !!camera &&
    range.start >= 0 &&
    range.end <= args.sourceDuration &&
    range.end - range.start >= 0.001 &&
    !camera.hiddenRanges.some(
      (item) =>
        (!replace || item.id !== hidden?.id) && item.start < range.end && item.end > range.start
    );
  return {
    camera,
    pending: acquisition.pending,
    failed: acquisition.failed,
    candidate: acquisition.candidate,
    time: args.time,
    duration: args.sourceDuration,
    available: !!camera || !!acquisition.candidate,
    retry: acquisition.retry,
    resourceAttempt: acquisition.attempt,
    toggle,
    selection: args.selection,
    selectedPosition,
    hidden,
    placement,
    select: choose,
    selectVisible: () => {
      const position = camera?.positions.findLast((item) => item.time <= args.time);
      choose(position ? { kind: 'webcam-position', id: position.id } : { kind: 'webcam' });
    },
    patch: (patch: Partial<QuickEditWebcam>) => mutate((current) => ({ ...current, ...patch })),
    place: (placement: QuickEditWebcamPlacement) =>
      mutate((current) =>
        selectedPosition
          ? {
              ...current,
              positions: current.positions.map((item) =>
                item.id === selectedPosition.id ? { ...item, placement } : item
              ),
            }
          : { ...current, placement }
      ),
    addPosition: () => {
      if (!camera || !latest.current.allowed()) return;
      const time = Math.round(args.time * 1000) / 1000;
      if (time < 0.001 || time >= args.sourceDuration) return;
      const existing = camera.positions.find((item) => item.time === time);
      if (existing) {
        choose({ kind: 'webcam-position', id: existing.id });
        return;
      }
      const id = crypto.randomUUID();
      mutate((current) => ({
        ...current,
        positions: [
          ...current.positions,
          {
            id,
            time,
            placement: quickEditWebcamPlacementAt(current, time),
            transition: { type: 'ease-in-out' as const, duration: 0.5 },
          },
        ].sort((a, b) => a.time - b.time),
      }));
      choose({ kind: 'webcam-position', id });
    },
    navigate: (id: string | null) => {
      const target = camera?.positions.find((item) => item.id === id);
      choose(target ? { kind: 'webcam-position', id: target.id } : { kind: 'webcam' });
      if (latest.current.allowed()) args.seek(target?.time ?? 0);
    },
    canHide,
    hide: (range: { start: number; end: number }, replace = false) => {
      if (!canHide(range, replace)) return;
      const id = (replace ? hidden?.id : undefined) ?? crypto.randomUUID();
      mutate((current) => ({
        ...current,
        hiddenRanges: [
          ...current.hiddenRanges.filter((item) => item.id !== id),
          { id, ...range },
        ].sort((a, b) => a.start - b.start),
      }));
      choose({ kind: 'webcam-hidden', id });
    },
    remove: () => {
      if (!latest.current.allowed() || acquisition.busy()) return;
      if (
        args.selection.kind === 'webcam' ||
        args.selection.kind === 'webcam-position' ||
        args.selection.kind === 'webcam-hidden'
      ) {
        const selection = args.selection;
        mutate((current) => removeReviewWebcamItem(current, selection));
        latest.current.select({ kind: 'none' });
      }
    },
  };
}

/** Discovery and private resource admission have one abort/commit lifecycle. */
function useReviewWebcamAcquisition(
  args: Pick<WebcamEditorArgs, 'session' | 'advanced' | 'scene' | 'select' | 'pause' | 'allowed'>
) {
  const latest = useRef(args);
  latest.current = args;
  const assetId = args.advanced.advanced.webcam?.assetId;
  const [candidate, setCandidate] = useState<Awaited<ReturnType<typeof findReviewWebcam>>>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempt, retry] = useState(0);
  const acquisition = useRef<AbortController | null>(null);
  const aggregateId = args.session.getSnapshot().snapshot.workspace.aggregateId;
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    if (!assetId) {
      void findReviewWebcam(aggregateId, abort.signal).then(
        (value) => {
          if (!abort.signal.aborted) setCandidate(value);
        },
        () => {
          if (!abort.signal.aborted) setFailed(true);
        }
      );
    }
    return () => abort.abort();
  }, [aggregateId, assetId, attempt]);
  useEffect(() => () => acquisition.current?.abort(), []);

  const attach = async (recoverAssetId?: string) => {
    if (!latest.current.allowed() || acquisition.current) return;
    if (!candidate && !recoverAssetId) return;
    const abort = new AbortController();
    acquisition.current = abort;
    setPending(true);
    setFailed(false);
    latest.current.pause();
    const assertCurrentTarget = () => {
      abort.signal.throwIfAborted();
      if (!latest.current.allowed() || latest.current.session !== args.session)
        throw new Error('Camera attachment target changed.');
    };
    try {
      if (recoverAssetId) {
        await recoverReviewWebcam(recoverAssetId, abort.signal);
        if (!abort.signal.aborted) retry((value) => value + 1);
      } else
        await attachReviewWebcam({
          aggregateId,
          mediaId: candidate!.id,
          signal: abort.signal,
          assertCurrentTarget,
          attach: async (assetId, source) => {
            await latest.current.advanced.flush();
            assertCurrentTarget();
            const before = args.session.getSnapshot().document.advancedContent;
            if (before.webcam) throw new Error('Camera already attached.');
            await args.session.commitDurable({
              id: crypto.randomUUID(),
              at: Date.now(),
              target: 'advancedContent',
              before,
              after: {
                ...before,
                webcam: createQuickEditWebcam(assetId, source, latest.current.scene),
              },
            });
          },
        });
      if (!abort.signal.aborted && !recoverAssetId) latest.current.select({ kind: 'webcam' });
    } catch {
      if (!abort.signal.aborted) setFailed(true);
    } finally {
      acquisition.current = null;
      if (!abort.signal.aborted) setPending(false);
    }
  };
  return {
    candidate,
    failed,
    pending,
    busy: () => !!acquisition.current,
    attempt,
    attach: () => attach(),
    retry: () => {
      if (assetId) return attach(assetId);
      setFailed(false);
      retry((value) => value + 1);
    },
  };
}
