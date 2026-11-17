import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type {
  ReviewAnchor,
  ReviewDocument,
  ReviewSelection,
} from '../../features/video/review/types';
import type { ReviewPlaybackRange } from './playback-range';
import type { ReviewTransportPosition } from './transport';
import { createTrackProjection } from './track-projection';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

/** A mounted source owner. Durable workspace revisions do not identify local document changes. */
interface ReviewCommandScope {
  session: object;
  sourceAssetId: string;
  resource: Blob;
  sourceUrl: string;
  sourceDuration: number;
}

/** One activation captures a coherent transport position and the inputs used to plan its mutation. */
export interface ReviewCommandContext {
  position: ReviewTransportPosition;
  scope: ReviewCommandScope;
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  selection: ReviewSelection;
  timelineSelection: ReviewAnchor;
  playbackRange: ReviewPlaybackRange | null;
}

export interface ReviewCommandPort {
  capture(): ReviewCommandContext | null;
  admit(context: ReviewCommandContext, action: (context: ReviewCommandContext) => void): void;
  isCurrent(
    context: ReviewCommandContext,
    basis: 'source' | 'temporal',
    compatible?: (current: Omit<ReviewCommandContext, 'position'>) => boolean
  ): boolean;
}

/** Reads authoritative state at activation; no clock subscriptions or project mutations live here. */
export function createReviewCommandPort(dependencies: {
  read(): Omit<ReviewCommandContext, 'position'> | null;
  readPosition(): ReviewTransportPosition;
  beforeAction(action: () => void): void;
  pauseAt(position: ReviewTransportPosition): boolean;
}): ReviewCommandPort {
  const current = (
    context: ReviewCommandContext,
    basis: 'source' | 'temporal',
    compatible?: (current: Omit<ReviewCommandContext, 'position'>) => boolean
  ) => {
    const latest = dependencies.read();
    if (!latest || !sameReviewCommandSource(context.scope, latest.scope)) return false;
    return (
      (basis === 'source' ||
        sameReviewCommandEdits(context.document, latest.document, context.scope.sourceDuration)) &&
      (!compatible || compatible(latest))
    );
  };
  return {
    capture() {
      const state = dependencies.read();
      if (!state) return null;
      const position = dependencies.readPosition();
      if (position.media && position.media.sourceId !== state.scope.sourceUrl) return null;
      return {
        ...state,
        position,
        scope: { ...state.scope },
        selection: structuredClone(state.selection),
        timelineSelection: { ...state.timelineSelection },
        playbackRange: state.playbackRange ? structuredClone(state.playbackRange) : null,
      };
    },
    admit(context, action) {
      dependencies.beforeAction(() => {
        if (current(context, 'temporal') && dependencies.pauseAt(context.position)) action(context);
      });
    },
    isCurrent: current,
  };
}

function sameReviewCommandSource(left: ReviewCommandScope, right: ReviewCommandScope) {
  return (
    left.session === right.session &&
    left.resource === right.resource &&
    left.sourceAssetId === right.sourceAssetId &&
    left.sourceUrl === right.sourceUrl &&
    left.sourceDuration === right.sourceDuration
  );
}

/** Compare the temporal input, not a durable revision or a cloned persistence projection. */
function sameReviewCommandEdits(left: ReviewDocument, right: ReviewDocument, duration: number) {
  return (
    left.edits === right.edits ||
    JSON.stringify(buildReviewTimeMap(duration, left.edits)) ===
      JSON.stringify(buildReviewTimeMap(duration, right.edits))
  );
}

/** Removed media is available only to an explicit source-domain command; result commands refuse it. */
export function reviewCommandSourceTime(context: ReviewCommandContext): number | null {
  return context.position.source?.sourceTime ?? context.position.media?.time ?? null;
}

function reviewCommandSelectedRange(context: ReviewCommandContext) {
  return (
    context.playbackRange ??
    (context.selection.kind === 'none' && context.timelineSelection.kind === 'range'
      ? context.timelineSelection
      : null)
  );
}

/** A completed attachment must not replace a newer user navigation or playback decision. */
export function reviewCommandCanPublishSelection(
  context: ReviewCommandContext,
  position: ReviewTransportPosition,
  playing: boolean
) {
  if (playing || position.epoch !== context.position.epoch) return false;
  if (position.mapRevision !== context.position.mapRevision) return true;
  const before = context.position.resultTime ?? reviewCommandSourceTime(context);
  const after = position.resultTime ?? position.source?.sourceTime ?? position.media?.time ?? null;
  if (before === null || after === null) return before === after;
  // Floating conversions within one canonical audio sample do not represent a new UI intent.
  return Math.abs(before - after) <= 1 / 48000;
}

/** Returns the selected bounds before cursor adjustment; placement owners apply their existing defaults. */
export function reviewCommandInsertion(context: ReviewCommandContext, domain: 'source' | 'result') {
  const sourceTime = reviewCommandSourceTime(context);
  const selected = reviewCommandSelectedRange(context);
  if (domain === 'source') {
    if (sourceTime === null) return null;
    return { time: sourceTime, duration: context.scope.sourceDuration, range: selected };
  }
  if (context.position.resultTime === null) return null;
  const projection = createTrackProjection(context.scope.sourceDuration, context.document.edits);
  return {
    time: context.position.resultTime,
    duration: projection.resultDuration,
    range: selected
      ? 'result' in selected && selected.result
        ? selected.result
        : {
            start: projection.output(selected.start),
            end: projection.output(selected.end),
          }
      : null,
  };
}
