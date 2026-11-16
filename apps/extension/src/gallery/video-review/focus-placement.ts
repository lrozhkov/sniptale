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

type FocusPlacementInput = {
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
  const context = reviewResultInsertionContext({
    time: props.time,
    resultTime: props.outputTime,
    range: selectedRange,
    projection,
  });
  const targetFor = (type: ReviewFocusType) =>
    reviewInsertionRange({
      ...context,
      seconds: 2,
      minimum: 0.001,
      occupied: [
        ...props.advanced.zoom.regions
          .filter(
            (region) =>
              !region.dormant &&
              (type === 'zoom' || type === '3d') &&
              quickEditFocusType(region) === type
          )
          .map((region) => ({
            start: region.start,
            end: (
              resolveQuickEditFocusLink(props.advanced.zoom.regions, region.id)?.target ?? region
            ).end,
          })),
      ],
    });
  const candidate = (range: ReviewAnchor, type: ReviewFocusType = props.zoom.insertionType) => {
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
    const point = props.insertionPoint?.(projection.source(range.start)) ?? { x: 0.5, y: 0.5 };
    region.transform = { ...region.transform, centerX: point.x, centerY: point.y };
    const area = region.spotlight ?? region.border;
    if (area)
      area.area = {
        ...area.area,
        x: Math.max(0, Math.min(1 - area.area.width, point.x - area.area.width / 2)),
        y: Math.max(0, Math.min(1 - area.area.height, point.y - area.area.height / 2)),
      };
    return quickEditFocusConflicts(props.advanced.zoom.regions, region) ? null : region;
  };
  const commit = (range: ReviewAnchor, type: ReviewFocusType = props.zoom.insertionType) => {
    const region = candidate(range, type);
    if (!region || props.advanced.zoom.regions.length >= 512) return;
    props.onPause();
    if (props.zoom.addRegion(region, type)) {
      setEnabled(false);
      props.setSelection({
        kind: 'point',
        time: projection.source(range.kind === 'range' ? range.start : context.time),
      });
      props.onSeekResult?.(range.kind === 'range' ? range.start : context.time);
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
        props.zoom.setInsertionType(type);
        props.audio.setOriginalTool(false);
        props.editing.setCutting(false);
        props.setTrackVisibility('zoom', true);
        const range = targetFor(type);
        if (range) commit(range, type);
      },
    },
  };
}
