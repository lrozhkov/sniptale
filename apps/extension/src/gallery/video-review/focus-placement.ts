import { useEffect, useState } from 'react';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { quickEditFocusConflicts } from '../../features/video/review/advanced/focus-layout';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { withReviewFocusType, type ReviewFocusType, type useReviewZoomEditor } from './zoom-editor';
import type { ReviewTrackProjection } from './track-projection';
import type { ReviewPlaybackRange } from './playback-range';
import type { useReviewAudio } from './use-review-audio';
import { reviewRangePlacementIssue } from './range-placement';
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
  setSelection(value: ReviewAnchor): void;
  onSeek(time: number): void;
  setTrackVisibility(track: 'zoom', visible: boolean): void;
};

/** The focus drawing tool uses source-axis ranges and the existing result-time insertion owner. */
export function useFocusPlacement(props: FocusPlacementInput, projection: ReviewTrackProjection) {
  const target = props.playbackRange
    ? { kind: 'range' as const, ...props.playbackRange }
    : props.selection;
  const { drawing: enabled, setDrawing: setEnabled } = props.zoom;
  const [preview, setPreview] = useState<ReviewAnchor | null>(null);
  const visible = resolveQuickEditEffectiveFeatures(props.advanced).zoomTrackVisible;
  const active = enabled && visible && !props.audio.originalTool && !props.editing.mode;
  useEffect(() => {
    if (!visible || props.audio.originalTool || props.editing.mode) setEnabled(false);
  }, [visible, props.audio.originalTool, props.editing.mode, setEnabled]);
  useEffect(() => {
    if (!active) setPreview(null);
  }, [active]);
  const candidate = (range: ReviewAnchor, type: ReviewFocusType = props.zoom.insertionType) => {
    if (
      range.kind !== 'range' ||
      range.end - range.start < 0.001 ||
      props.edits.some(
        (edit) => edit.kind === 'cut' && edit.start < range.end && edit.end > range.start
      )
    )
      return null;
    const start = projection.output(range.start);
    const end = projection.output(range.end);
    if (end - start < 0.001) return null;
    const region = withReviewFocusType(
      createQuickEditZoomRegion({
        id: 'draft',
        sourceAnchor: { start: range.start, end: range.end },
        at: start,
        duration: end - start,
        endMax: end,
      }),
      type
    );
    return quickEditFocusConflicts(props.advanced.zoom.regions, region) ? null : region;
  };
  const commit = (range: ReviewAnchor, type: ReviewFocusType = props.zoom.insertionType) => {
    const region = candidate(range, type);
    if (!region || props.advanced.zoom.regions.length >= 512) return;
    if (props.zoom.addRegion(region)) {
      setEnabled(!!props.playbackRange);
      props.setSelection({
        kind: 'point',
        time: range.kind === 'range' ? range.start : props.time,
      });
      props.onSeek(range.kind === 'range' ? range.start : props.time);
    }
  };
  return {
    clear: () => setEnabled(false),
    preview,
    setPreview,
    commit,
    tool: {
      type: props.zoom.insertionType,
      onType: props.zoom.setInsertionType,
      active,
      available: props.playbackRange
        ? !!candidate(target) && props.advanced.zoom.regions.length < 512
        : active || props.selectedObject || target.kind !== 'range' || !!candidate(target),
      availableFor: (type: ReviewFocusType) =>
        props.playbackRange
          ? !!candidate(target, type) && props.advanced.zoom.regions.length < 512
          : active || props.selectedObject || target.kind !== 'range' || !!candidate(target, type),
      hint:
        target.kind === 'range' && (props.playbackRange || !props.selectedObject)
          ? focusPlacementHint(
              reviewRangePlacementIssue({
                range: target,
                edits: props.edits,
                available: !!candidate(target),
                limit: props.advanced.zoom.regions.length >= 512,
                occupied: !candidate(target) && target.end - target.start >= 0.001,
              })
            )
          : undefined,
      onToggle: (type: ReviewFocusType = props.zoom.insertionType) => {
        props.zoom.setInsertionType(type);
        props.audio.setOriginalTool(false);
        props.editing.setCutting(false);
        if (props.playbackRange || (!active && !props.selectedObject && target.kind === 'range')) {
          props.setTrackVisibility('zoom', true);
          commit(target, type);
        } else if (active && type === props.zoom.insertionType) setEnabled(false);
        else {
          props.setTrackVisibility('zoom', true);
          setEnabled(true);
        }
      },
    },
  };
}

function focusPlacementHint(issue: ReturnType<typeof reviewRangePlacementIssue>) {
  return issue ? translate(`gallery.videoReview.placement_${issue}`) : undefined;
}
