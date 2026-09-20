import type { Dispatch, SetStateAction } from 'react';
import type { ReviewAnchor, ReviewEdit, ReviewSelection } from '../../features/video/review/types';
import type { useReviewAdvanced } from './use-advanced';
import { commitReviewEdit, useReviewEdits } from './use-edits';
import type { useReviewExport } from './use-export';
import { useReviewZoomEditor } from './zoom-editor';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/** Owns edit and zoom tool selection while persistence remains in their domain hooks. */
export function useReviewEditingTools(args: {
  advancedState: ReturnType<typeof useReviewAdvanced>;
  zoom: ReturnType<typeof useReviewAdvanced>['advanced']['zoom'];
  timelineDuration: number;
  timelineSelection: ReviewAnchor;
  activeSelection: ReviewSelection;
  setActiveSelection: Dispatch<SetStateAction<ReviewSelection>>;
  sourceDuration: number;
  exporter: ReturnType<typeof useReviewExport>;
  edits: readonly ReviewEdit[];
  pause(): void;
  seek(value: number): void;
  setTimelineSelection(value: ReviewAnchor): void;
  onInvalid(): void;
  session: Session;
  run(action: () => Promise<unknown>): Promise<unknown>;
  busy: boolean;
  canStart(): boolean;
}) {
  const zoom = useReviewZoomEditor({
    setZoom: args.advancedState.setZoom,
    zoom: args.zoom,
    timelineDuration: args.timelineDuration,
    selection: args.activeSelection.kind === 'zoom' ? args.activeSelection.id : null,
    onSelectionChange: (id) =>
      args.setActiveSelection(id ? { kind: 'zoom', id } : { kind: 'none' }),
    linkSelection: args.activeSelection.kind === 'zoom-link' ? args.activeSelection.id : null,
    onLinkSelectionChange: (id) =>
      args.setActiveSelection(id ? { kind: 'zoom-link', id } : { kind: 'none' }),
  });
  const cuts = useReviewEdits({
    duration: args.sourceDuration,
    selection: args.timelineSelection,
    snapToKeyframes: args.advancedState.advanced.ui.mode !== 'advanced',
    ...(args.exporter.index ? { boundaries: args.exporter.index.boundaries } : {}),
    edits: args.edits,
    pause: args.pause,
    onInvalid: args.onInvalid,
    seek: args.seek,
    setSelection: args.setTimelineSelection,
    selectedEditId: args.activeSelection.kind === 'edit' ? args.activeSelection.id : null,
    onSelectedEditIdChange: (id) =>
      args.setActiveSelection(id ? { kind: 'edit', id } : { kind: 'none' }),
    commit: (before, after) =>
      commitReviewEdit({
        session: args.session,
        run: (action) =>
          args.run(async () => {
            await args.advancedState.flush();
            return action();
          }),
        busy: args.busy,
        exporterPhase: args.exporter.phase,
        canStart: args.canStart,
        before,
        after,
      }),
  });
  return { zoom, cuts };
}
