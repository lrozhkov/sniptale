import { reviewInteractionFamily } from '../../features/video/review/interaction-timeline';
import { resolveReviewTimelineSelection } from './timeline-batch-selection';
import { reviewTrackEnabled } from '../../features/video/review/advanced/track-controls';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { originalAudioRangeViews } from '../../features/video/review/advanced/original-audio-mutes';
import { createTrackProjection } from './track-projection';
import {
  projectReviewVoiceover,
  reviewVoiceoverRange,
} from '../../features/video/review/voiceover-edits';
import {
  buildReviewTimeMap,
  createReviewDisplayMap,
  type ReviewTimeSegment,
} from '../../features/video/review/timeline';
import { projectReviewFocus } from '../../features/video/review/focus-edits';
import {
  projectReviewCursorMotions,
  projectReviewWebcam,
} from '../../features/video/review/timeline-placement';
import { retimeReviewVoiceover } from '../../features/video/review/voiceover-timing';
import { useEffect, useRef, useState } from 'react';
import type {
  ReviewDocument,
  ReviewOperation,
  ReviewSelection,
} from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import { resolveQuickEditZoomLink } from '../../features/video/review/advanced/zoom';

type SelectionInterval = { start: number; end: number; domain: 'source' | 'result' };
type SelectionNavigation = {
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  duration: number;
  markers: readonly ReviewTelemetryMarker[];
  sourceTime: number;
  resultTime: number;
  segments?: readonly ReviewTimeSegment[];
};
type SelectionGeometry = Omit<SelectionNavigation, 'sourceTime' | 'resultTime'>;

/** Resolve current lane membership and cursor samples before deriving selected-item bounds. */
export function reviewTimelineSelectionInterval(
  keys: readonly string[],
  selection: ReviewSelection,
  context: SelectionGeometry,
  cursorFocusKeys: readonly { id: string; sourceTime: number }[]
) {
  const selections =
    keys.length > 1
      ? keys.map((key) => {
          const item = resolveReviewTimelineSelection(key, context.advanced);
          if (item?.kind !== 'cursor-focus') return item;
          const point = cursorFocusKeys.find((point) => point.id === item.id);
          return point ? { ...item, time: point.sourceTime } : null;
        })
      : [selection];
  if (selections.some((item) => !item)) return null;
  return reviewSelectionInterval(
    selections.filter((item) => item !== null),
    context
  );
}

/** Bounds include gaps between selected items and retain exact positions inside inserted freezes. */
export function reviewSelectionInterval(
  selections: readonly ReviewSelection[],
  context: SelectionGeometry
) {
  const display = createReviewDisplayMap(context.duration, context.document.edits);
  const intervals = selections.map((selection) => selectionIntervals(selection, context));
  if (!intervals.length || intervals.some((ranges) => !ranges.length)) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const range of intervals.flat()) {
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end < range.start)
      return null;
    const convert = range.domain === 'source' ? display.sourceToDisplay : display.resultToDisplay;
    start = Math.min(start, convert(range.start));
    end = Math.max(end, convert(range.end, range.start === range.end ? 'start' : 'end'));
  }
  start = Math.max(0, start);
  end = Math.min(display.duration, end);
  if (end - start < 0.05 - 1e-9) return null;
  const result = { start: display.displayToResult(start), end: display.displayToResult(end) };
  return {
    start: display.displayToSource(start),
    end: display.displayToSource(end),
    ...(result.end - result.start >= 0.05 - 1e-9 ? { result } : {}),
  };
}

/** Selection preserves an active playhead; only an outside position needs an unsnapped seek. */
export function reviewSelectionSeekTarget(
  selection: ReviewSelection,
  context: SelectionNavigation
) {
  const intervals = selectionIntervals(selection, context).filter(
    (range) =>
      Number.isFinite(range.start) && Number.isFinite(range.end) && range.end >= range.start
  );
  if (
    intervals.some((range) => {
      const time = range.domain === 'source' ? context.sourceTime : context.resultTime;
      return range.end === range.start
        ? Math.abs(time - range.start) <= 0.001
        : time >= range.start && time < range.end;
    })
  )
    return null;
  const first = intervals.toSorted((a, b) => a.start - b.start)[0];
  return first ? { domain: first.domain, time: first.start } : null;
}

function selectionIntervals(
  selection: ReviewSelection,
  context: SelectionGeometry
): SelectionInterval[] {
  const { document, advanced, duration, markers } = context;
  const ranges = (
    value: { start: number; end: number } | undefined,
    domain: SelectionInterval['domain'] = 'source'
  ) => (value ? [{ ...value, domain }] : []);
  const point = (time: number | undefined, domain: SelectionInterval['domain'] = 'source') =>
    time === undefined ? [] : ranges({ start: time, end: time }, domain);
  const segments = context.segments ?? buildReviewTimeMap(duration, document.edits);
  switch (selection.kind) {
    case 'none':
      return [];
    case 'cursor-focus':
      return point(selection.time);
    case 'edit': {
      const edit = document.edits.find((item) => item.id === selection.id);
      if (edit?.kind !== 'freeze') return ranges(edit);
      const hold = segments.find((part) => part.freezeId === edit.id);
      return hold ? ranges({ start: hold.resultStart, end: hold.resultEnd }, 'result') : [];
    }
    case 'annotation': {
      const anchor = document.annotations.find((item) => item.id === selection.id)?.anchor;
      return anchor?.kind === 'point' ? point(anchor.time) : ranges(anchor);
    }
    case 'canvas-comment': {
      const item = document.canvasComments.find((item) => item.id === selection.id);
      return item ? ranges({ start: item.start ?? 0, end: item.end ?? duration }) : [];
    }
    case 'annotation-effect': {
      const item = advanced.annotationEffects?.instances.find((item) => item.id === selection.id);
      return ranges(item, item?.timeDomain ?? 'source');
    }
    case 'text': {
      const item = advanced.text?.fragments.find((item) => item.id === selection.id);
      return ranges(item, item?.timeDomain === 'source' ? 'source' : 'result');
    }
    case 'telemetry': {
      const item = markers.find(
        (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
      );
      return ranges(item, item?.timeDomain ?? 'source');
    }
    case 'cursor-motion': {
      const item = advanced.cursorMotions?.find((item) => item.id === selection.id);
      return (item ? (projectReviewCursorMotions([item], segments) ?? []) : []).flatMap((item) =>
        ranges(item, 'result')
      );
    }
    case 'zoom': {
      const item = advanced.zoom.regions.find((item) => item.id === selection.id);
      if (!item) return [];
      const projected = projectReviewFocus([{ ...item, dormant: false }], segments);
      return projected.flatMap((item) => ranges(item, 'result'));
    }
    case 'zoom-link': {
      const link = resolveQuickEditZoomLink(advanced.zoom.regions, selection.id);
      if (!link) return [];
      const source = projectReviewFocus([link.source], segments).at(-1);
      const target = projectReviewFocus([link.target], segments)[0];
      return source && target ? ranges({ start: source.end, end: target.start }, 'result') : [];
    }
    case 'original-audio':
      return ranges(
        originalAudioRangeViews(
          advanced.audio,
          resolveQuickEditEffectiveFeatures(advanced).voiceoverApplied
        ).find((item) => item.id === selection.id)
      );
    case 'audio': {
      const item = advanced.audio[selection.lane].find((item) => item.id === selection.id);
      return (
        item
          ? projectReviewVoiceover(
              [item],
              segments,
              selection.lane === 'music' ? 'fill' : 'continue'
            )
          : []
      ).map((item) => ({
        start: item.timelineStart,
        end: item.timelineStart + item.duration,
        domain: 'result',
      }));
    }
    case 'webcam':
      return ranges({ start: 0, end: duration });
    case 'webcam-position':
    case 'webcam-hidden': {
      const camera = projectReviewWebcam(advanced.webcam, segments);
      const domain = camera?.timeDomain ?? 'source';
      if (selection.kind === 'webcam-hidden')
        return ranges(
          camera?.hiddenRanges.find((item) => item.id === selection.id),
          domain
        );
      const index = camera?.positions.findIndex((item) => item.id === selection.id) ?? -1;
      const item = camera?.positions[index];
      return item
        ? ranges(
            {
              start: item.time,
              end:
                camera?.positions[index + 1]?.time ??
                (domain === 'result' ? (segments.at(-1)?.resultEnd ?? duration) : duration),
            },
            domain
          )
        : [];
    }
  }
}

/** Builds the history deletion represented by a text or edit selection. */
export function selectedHistoryRemoval(
  selection: ReviewSelection,
  document: ReviewDocument
): ReviewOperation | null {
  const at = Date.now();
  if (selection.kind === 'edit') {
    const before = document.edits.find((item) => item.id === selection.id);
    return before ? { id: crypto.randomUUID(), at, target: 'edit', before, after: null } : null;
  }
  if (selection.kind === 'annotation') {
    const before = document.annotations.find((item) => item.id === selection.id);
    return before
      ? { id: crypto.randomUUID(), at, target: 'annotation', before, after: null }
      : null;
  }
  return null;
}

/** Invalid selections never remain as hidden keyboard targets after history changes. */
export function reviewSelectionExists(
  selection: ReviewSelection,
  document: ReviewDocument,
  advanced: QuickEditAdvancedState,
  markers: readonly ReviewTelemetryMarker[] = [],
  cursorFocusPath?: CursorFocusPath,
  cursorFocusKeys: readonly { id: string }[] = []
): boolean {
  if (selection.kind === 'none') return false;
  if (selection.kind === 'cursor-motion')
    return !!advanced.cursorMotions?.some((m) => m.id === selection.id);
  if (selection.kind === 'cursor-focus')
    return (
      cursorFocusKeys.some((key) => key.id === selection.id) ||
      ((cursorFocusPath ?? advanced.cursorFocusPath)?.segments.some((segment) =>
        segment.keys.some((key) => key.id === selection.id)
      ) ??
        false)
    );
  if (selection.kind === 'webcam') return !!advanced.webcam?.enabled;
  if (selection.kind === 'webcam-position')
    return (
      !!advanced.webcam?.enabled &&
      advanced.webcam.positions.some((item) => item.id === selection.id)
    );
  if (selection.kind === 'webcam-hidden')
    return (
      !!advanced.webcam?.enabled &&
      advanced.webcam.hiddenRanges.some((item) => item.id === selection.id)
    );
  if (selection.kind === 'telemetry')
    return markers.some(
      (marker) => marker.ref.kind === selection.ref.kind && marker.ref.id === selection.ref.id
    );
  if (selection.kind === 'edit') return document.edits.some((item) => item.id === selection.id);
  if (selection.kind === 'annotation')
    return document.annotations.some((item) => item.id === selection.id);
  if (selection.kind === 'canvas-comment')
    return document.canvasComments.some((item) => item.id === selection.id);
  if (selection.kind === 'annotation-effect')
    return !!advanced.annotationEffects?.instances.some((item) => item.id === selection.id);
  if (selection.kind === 'text')
    return !!advanced.text?.fragments.some((item) => item.id === selection.id);
  if (selection.kind === 'zoom')
    return advanced.zoom.regions.some((item) => item.id === selection.id);
  if (selection.kind === 'zoom-link')
    return resolveQuickEditZoomLink(advanced.zoom.regions, selection.id) !== null;
  if (selection.kind === 'original-audio')
    return originalAudioRangeViews(
      advanced.audio,
      resolveQuickEditEffectiveFeatures(advanced).voiceoverApplied
    ).some((range) => range.id === selection.id);
  if (selection.kind === 'audio')
    return advanced.audio[selection.lane].some((item) => item.id === selection.id);
  return false;
}

/**
 * One active selection owner: Delete, the inspector, handles, and keyboard
 * navigation read it from here, so a stale edit never hides behind a newer
 * selection. Not persistent content; invalid ids clear to none.
 */
export function useReviewSelection() {
  const [selection, setSelection] = useState<ReviewSelection>({ kind: 'none' });
  return { selection, setSelection };
}

/** Binds the shared selection to deletion and invalidation without owning lane state. */
export function useReviewSelectionLifecycle(args: {
  selection: ReviewSelection;
  setSelection(selection: ReviewSelection): void;
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  markers?: readonly ReviewTelemetryMarker[];
  cursorFocusPath?: CursorFocusPath;
  cursorFocusKeys?: readonly { id: string }[];
  historyPending?: boolean;
  deleteCursorFocus?(id: string): void;
  deleteCursorMotion?(id: string): void;
  commit(operation: ReviewOperation): Promise<unknown>;
  run(action: () => Promise<unknown>): Promise<unknown>;
  deleteCanvas(id: string): void;
  deleteText?(id: string): void;
  deleteAnnotationEffect?(id: string): void;
  deleteZoom(id: string): void;
  deleteZoomLink(id: string): void;
  deleteAudio(lane: 'voiceover' | 'music', id: string): void;
  deleteOriginalAudio?(id: string): void;
  deleteTelemetry?(marker: ReviewTelemetryMarker): void;
  deleteWebcam?(
    selection: Extract<ReviewSelection, { kind: 'webcam' | 'webcam-position' | 'webcam-hidden' }>
  ): void;
  clearAnnotation(): void;
}) {
  const remove = () => {
    if (args.selection.kind === 'none') return;
    if (args.selection.kind === 'telemetry') {
      const ref = args.selection.ref;
      const marker = (args.markers ?? []).find(
        (m) => m.ref.kind === ref.kind && m.ref.id === ref.id
      );
      if (marker) args.deleteTelemetry?.(marker);
      return;
    }
    if (args.selection.kind === 'cursor-motion') {
      args.deleteCursorMotion?.(args.selection.id);
      args.setSelection({ kind: 'none' });
      return;
    }
    if (args.selection.kind === 'cursor-focus') {
      const selectedId = args.selection.id;
      const key = args.cursorFocusPath?.segments
        .flatMap((segment) => segment.keys)
        .find((key) => key.id === selectedId);
      if (key?.anchor !== 'manual') return;
      args.deleteCursorFocus?.(args.selection.id);
      args.setSelection({ kind: 'none' });
      return;
    }
    const historyRemoval = selectedHistoryRemoval(args.selection, args.document);
    if (historyRemoval) void args.run(() => args.commit(historyRemoval));
    else if (args.selection.kind === 'canvas-comment') args.deleteCanvas(args.selection.id);
    else if (args.selection.kind === 'annotation-effect')
      args.deleteAnnotationEffect?.(args.selection.id);
    else if (args.selection.kind === 'text') args.deleteText?.(args.selection.id);
    else if (args.selection.kind === 'zoom') args.deleteZoom(args.selection.id);
    else if (args.selection.kind === 'zoom-link') args.deleteZoomLink(args.selection.id);
    else if (args.selection.kind === 'original-audio')
      args.deleteOriginalAudio?.(args.selection.id);
    else if (
      args.selection.kind === 'webcam' ||
      args.selection.kind === 'webcam-position' ||
      args.selection.kind === 'webcam-hidden'
    )
      args.deleteWebcam?.(args.selection);
    else if (args.selection.kind === 'audio')
      args.deleteAudio(args.selection.lane, args.selection.id);
    args.setSelection({ kind: 'none' });
  };
  useEffect(() => {
    if (args.selection.kind === 'cursor-focus' && args.historyPending) return;
    if (
      args.selection.kind !== 'none' &&
      !reviewSelectionExists(
        args.selection,
        args.document,
        args.advanced,
        args.markers,
        args.cursorFocusPath,
        args.cursorFocusKeys
      )
    )
      args.setSelection({ kind: 'none' });
  }, [args]);
  const clearAnnotation = useRef(args.clearAnnotation);
  clearAnnotation.current = args.clearAnnotation;
  useEffect(() => {
    if (args.selection.kind !== 'annotation') clearAnnotation.current();
  }, [args.selection.kind]);
  return remove;
}

/** Projects the active object's center onto the source clock used by the quick timeline. */
export function reviewSelectionSourceTime(
  selection: ReviewSelection,
  document: ReviewDocument,
  advanced: QuickEditAdvancedState,
  duration: number,
  markers: readonly ReviewTelemetryMarker[] = [],
  originalAudioVisible = true
): number | null {
  if (!selectionTrackVisible(selection, advanced, originalAudioVisible, markers)) return null;
  const midpoint = (range: { start: number; end: number } | undefined) =>
    range ? (range.start + range.end) / 2 : null;
  switch (selection.kind) {
    case 'cursor-motion':
      return midpoint(advanced.cursorMotions?.find((m) => m.id === selection.id));
    case 'cursor-focus':
      return selection.time;
    case 'none':
      return null;
    case 'webcam':
      return null;
    case 'webcam-position':
      return advanced.webcam?.positions.find((item) => item.id === selection.id)?.time ?? null;
    case 'webcam-hidden':
      return midpoint(advanced.webcam?.hiddenRanges.find((item) => item.id === selection.id));
    case 'edit':
      return midpoint(document.edits.find((item) => item.id === selection.id));
    case 'annotation': {
      const anchor = document.annotations.find((item) => item.id === selection.id)?.anchor;
      return anchor?.kind === 'point' ? anchor.time : midpoint(anchor);
    }
    case 'canvas-comment': {
      const comment = document.canvasComments.find((item) => item.id === selection.id);
      return comment?.visible ? ((comment.start ?? 0) + (comment.end ?? duration)) / 2 : null;
    }
    case 'annotation-effect':
      return midpoint(
        advanced.annotationEffects?.instances.find((item) => item.id === selection.id)
      );
    case 'text': {
      const fragment = advanced.text?.fragments.find((item) => item.id === selection.id);
      if (!fragment) return null;
      if (fragment.timeDomain === 'source') return midpoint(fragment);
      const projection = createTrackProjection(duration, document.edits);
      return (projection.source(fragment.start) + projection.source(fragment.end, 'end')) / 2;
    }
    case 'telemetry':
      return midpoint(
        markers.find(
          (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
        )
      );
    case 'zoom':
      return midpoint(
        focusSourceRange(
          advanced.zoom.regions.find((item) => item.id === selection.id && !item.dormant),
          duration,
          document.edits
        )
      );
    case 'zoom-link': {
      const link = resolveQuickEditZoomLink(advanced.zoom.regions, selection.id);
      return link ? focusLinkSourceTime(link, duration, document.edits) : null;
    }
    case 'original-audio':
      return midpoint(
        originalAudioRangeViews(
          advanced.audio,
          resolveQuickEditEffectiveFeatures(advanced).voiceoverApplied
        ).find((item) => item.id === selection.id)
      );
    case 'audio': {
      const clip = advanced.audio[selection.lane].find(
        (item) => item.id === selection.id && !item.dormant
      );
      if (!clip) return null;
      if (selection.lane === 'voiceover' && advanced.audio.voiceoverSegments)
        return midpoint(
          reviewVoiceoverRange(retimeReviewVoiceover(clip, advanced.audio.voiceoverSegments))
        );
      const range = reviewVoiceoverRange(clip);
      const projection = createTrackProjection(duration, document.edits);
      return (projection.source(range.start) + projection.source(range.end, 'end')) / 2;
    }
  }
}

function focusSourceRange(
  region: QuickEditZoomRegion | undefined,
  duration: number,
  edits: ReviewDocument['edits']
) {
  if (!region || region.dormant) return undefined;
  if (region.sourceAnchor) return region.sourceAnchor;
  const projection = createTrackProjection(duration, edits);
  return { start: projection.source(region.start), end: projection.source(region.end, 'end') };
}

/** Hidden advanced lanes keep their selection but cannot anchor viewport navigation. */
function selectionTrackVisible(
  selection: ReviewSelection,
  advanced: QuickEditAdvancedState,
  originalAudioVisible: boolean,
  markers: readonly ReviewTelemetryMarker[]
) {
  const features = resolveQuickEditEffectiveFeatures(advanced);
  switch (selection.kind) {
    case 'cursor-motion':
      return advanced.ui.mode === 'advanced' && advanced.ui.tracks.cursorMotion !== false;
    case 'webcam':
    case 'webcam-position':
    case 'webcam-hidden':
      return features.webcamTrackVisible;
    case 'annotation-effect':
      return features.annotationEffectsTrackVisible;
    case 'zoom':
      return features.zoomTrackVisible;
    case 'zoom-link':
      return features.zoomApplied;
    case 'audio':
      return features.audioTrackVisible;
    case 'telemetry': {
      const marker = markers.find(
        (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
      );
      const family = marker ? reviewInteractionFamily(marker) : undefined;
      return features.actionsTrackVisible && (!family || reviewTrackEnabled(advanced.ui, family));
    }
    case 'canvas-comment':
      return features.overlaysVisible;
    case 'original-audio':
      return originalAudioVisible;
    default:
      return true;
  }
}

/** Link geometry uses the result gap projected to source, excluding cut-crossing links. */
function focusLinkSourceTime(
  link: { source: QuickEditZoomRegion; target: QuickEditZoomRegion },
  duration: number,
  edits: ReviewDocument['edits']
) {
  const projection = createTrackProjection(duration, edits);
  const from = link.source.sourceAnchor;
  const to = link.target.sourceAnchor;
  if (
    from &&
    to &&
    projection.cuts.some((cut) => cut.sourceStart < to.start && cut.sourceEnd > from.end)
  )
    return null;
  const start = projection.source(link.source.end, 'end');
  const end = projection.source(link.target.start);
  return end > start ? (start + end) / 2 : null;
}
