import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import {
  quickEditFocusType,
  resolveQuickEditFocusLink,
  quickEditFocusConflicts,
} from '../../features/video/review/advanced/focus-layout';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { withReviewFocusType, type ReviewFocusType, type useReviewZoomEditor } from './zoom-editor';
import type { ReviewTrackProjection } from './track-projection';
import type { ReviewPlaybackRange } from './playback-range';
import type { useReviewAudio } from './use-review-audio';
import { reviewInsertionRange, reviewResultInsertionContext } from './range-placement';
import { translate } from '../../platform/i18n';
import {
  reviewCommandInsertion,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewFocus } from '../../features/video/review/focus-edits';
import { createTrackProjection } from './track-projection';

type FocusPlacementInput = {
  commands: ReviewCommandPort;
  playbackRange?: ReviewPlaybackRange | null | undefined;
  selection: ReviewAnchor;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  advanced: QuickEditAdvancedState;
  audio: Pick<ReturnType<typeof useReviewAudio>, 'originalTool' | 'setOriginalTool'>;
  editing: { mode: 'cut' | 'speed' | null; setCutting(value: false): void };
  edits: readonly ReviewEdit[];
  selectedObject: boolean;
  time: number;
  outputTime: number | null;
  source: { duration: number };
  insertionPoint?(time: number): { x: number; y: number } | null;
  onPause(): void;
  setSelection(value: ReviewAnchor): void;
  onSeek(time: number): void;
  onSeekResult?(time: number): void;
  setTrackVisibility(track: 'zoom', visible: boolean): void;
};

/** Direct insertion keeps source anchors and the existing focus mutation owner. */
export function useFocusPlacement(props: FocusPlacementInput, projection: ReviewTrackProjection) {
  const selectedRange =
    props.playbackRange ??
    (!props.selectedObject && props.selection.kind === 'range' ? props.selection : null);
  const { setDrawing: setEnabled } = props.zoom;
  const renderContext = reviewResultInsertionContext({
    time: props.time,
    resultTime: props.outputTime,
    range: selectedRange,
    projection,
  });
  const regions = (context?: ReviewCommandContext) =>
    projectReviewFocus(
      context?.advanced.zoom.regions ?? props.advanced.zoom.regions,
      buildReviewTimeMap(
        context?.scope.sourceDuration ?? props.source.duration,
        context?.document.edits ?? props.edits
      )
    );
  const targetFor = (type: ReviewFocusType, context?: ReviewCommandContext) => {
    const insertion = context ? reviewCommandInsertion(context, 'result') : renderContext;
    if (!insertion) return null;
    const currentRegions = regions(context);
    return reviewInsertionRange({
      ...insertion,
      seconds: 2,
      minimum: 0.001,
      occupied: [
        ...currentRegions
          .filter(
            (region) =>
              !region.dormant &&
              (type === 'zoom' || type === '3d') &&
              quickEditFocusType(region) === type
          )
          .map((region) => ({
            start: region.start,
            end: (resolveQuickEditFocusLink(currentRegions, region.id)?.target ?? region).end,
          })),
      ],
    });
  };
  const candidate = (
    range: ReviewAnchor,
    type: ReviewFocusType = props.zoom.insertionType,
    context?: ReviewCommandContext
  ) => {
    if (range.kind !== 'range' || range.end - range.start < 0.001) return null;
    const start = range.start;
    const end = range.end;
    const region = withReviewFocusType(
      createQuickEditZoomRegion({
        id: 'draft',
        at: start,
        duration: end - start,
        endMax: end,
      }),
      type
    );
    region.timeDomain = 'result';
    const currentProjection = context
      ? createTrackProjection(context.scope.sourceDuration, context.document.edits)
      : projection;
    const point = props.insertionPoint?.(currentProjection.source(range.start)) ?? {
      x: 0.5,
      y: 0.5,
    };
    region.transform = { ...region.transform, centerX: point.x, centerY: point.y };
    const area = region.spotlight ?? region.border;
    if (area)
      area.area = {
        ...area.area,
        x: Math.max(0, Math.min(1 - area.area.width, point.x - area.area.width / 2)),
        y: Math.max(0, Math.min(1 - area.area.height, point.y - area.area.height / 2)),
      };
    return quickEditFocusConflicts(regions(context), region) ? null : region;
  };
  const commit = (
    range: Extract<ReviewAnchor, { kind: 'range' }>,
    type: ReviewFocusType,
    context: ReviewCommandContext
  ) => {
    const region = candidate(range, type, context);
    if (!region || context.advanced.zoom.regions.length >= 512) return;
    if (props.zoom.addRegion(region, type, context)) {
      const currentProjection = createTrackProjection(
        context.scope.sourceDuration,
        context.document.edits
      );
      setEnabled(false);
      props.setSelection({
        kind: 'point',
        time: currentProjection.source(range.start),
      });
      props.onSeekResult?.(range.start);
    }
  };
  return {
    clear: () => setEnabled(false),
    tool: {
      type: props.zoom.insertionType,
      onType: props.zoom.setInsertionType,
      active: false,
      available: !!targetFor(props.zoom.insertionType) && props.advanced.zoom.regions.length < 512,
      availableFor: (type: ReviewFocusType) => {
        const range = targetFor(type);
        return !!range && !!candidate(range, type) && props.advanced.zoom.regions.length < 512;
      },
      hint: targetFor(props.zoom.insertionType)
        ? undefined
        : translate('gallery.videoReview.placement_occupied'),
      onToggle: (type: ReviewFocusType = props.zoom.insertionType) => {
        const context = props.commands.capture();
        if (!context) return;
        props.commands.admit(context, (accepted) => {
          if (
            !props.commands.isCurrent(
              accepted,
              'temporal',
              (current) =>
                JSON.stringify(current.advanced.zoom) === JSON.stringify(accepted.advanced.zoom)
            )
          )
            return;
          props.zoom.setInsertionType(type);
          props.audio.setOriginalTool(false);
          props.editing.setCutting(false);
          props.setTrackVisibility('zoom', true);
          const range = targetFor(type, accepted);
          if (range) commit(range, type, accepted);
        });
      },
    },
  };
}
