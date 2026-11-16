import { useMemo } from 'react';
import { ReviewFragmentAction } from './edit-actions';
import { reviewTimelineSelectionInterval } from './use-review-selection';
import type { useReviewEditorState } from './use-editor-state';
import type { ReviewPlaybackRange } from './playback-range';

type State = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'activeSelection'
  | 'selection'
  | 'playbackRange'
  | 'snapshot'
  | 'advanced'
  | 'source'
  | 'projected'
  | 'timeline'
  | 'cursorFocusKeys'
  | 'editing'
  | 'busy'
  | 'composer'
  | 'beforeAction'
  | 'pause'
>;

/** A retained interval wins; selected-item geometry is only the fallback for fragment download. */
export function ReviewTimelineFragment({
  state,
  keys,
  onSelectInterval,
  onOpenExport,
}: {
  state: State;
  keys: readonly string[];
  onSelectInterval(range: ReviewPlaybackRange): void;
  onOpenExport(): void;
}) {
  const {
    playbackRange,
    selection,
    activeSelection,
    snapshot,
    advanced,
    source,
    projected,
    timeline,
    cursorFocusKeys,
  } = state;
  const range = useMemo(
    () =>
      playbackRange ??
      (selection.kind === 'range'
        ? selection
        : activeSelection.kind === 'none' && keys.length <= 1
          ? null
          : reviewTimelineSelectionInterval(
              keys,
              activeSelection,
              {
                document: snapshot.document,
                advanced,
                duration: source.duration,
                markers: projected.markers,
                segments: timeline.timeMap.getSegments(),
              },
              cursorFocusKeys
            )),
    [
      playbackRange,
      selection,
      keys,
      activeSelection,
      snapshot.document,
      advanced,
      source.duration,
      projected.markers,
      timeline.timeMap,
      cursorFocusKeys,
    ]
  );
  const existing = !!playbackRange || selection.kind === 'range';
  const exportSelection = useMemo(
    () => (range ? { kind: 'range' as const, ...range } : { kind: 'point' as const, time: 0 }),
    [range]
  );
  const exporter = state.editing.exporter;
  return (
    <ReviewFragmentAction
      persistent
      iconOnly
      selection={exportSelection}
      snapToKeyframes={advanced.ui.mode !== 'advanced'}
      index={exporter.index}
      edits={snapshot.document.edits}
      busy={
        state.busy ||
        !!state.composer.before ||
        exporter.checkingCodecs ||
        exporter.phase !== 'idle'
      }
      onDownload={() =>
        state.beforeAction(() => {
          if (!range) return;
          state.pause();
          if (!existing) onSelectInterval(range);
          onOpenExport();
          void exporter.downloadSelection({ kind: 'range', ...range });
        })
      }
    />
  );
}
