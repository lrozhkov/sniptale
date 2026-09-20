import { useMemo, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type {
  ReviewAnchor,
  ReviewAnnotation,
  ReviewDocument,
  ReviewSelection,
} from '../../features/video/review/types';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';
import { useReviewCommentActions } from './use-review-comments';
import type { useReviewComposer } from './use-session';
import type { LoadedReview } from './use-session';
import type { useReviewAdvanced } from './use-advanced';
import { useCanvasComments } from './use-canvas-comments';
import { prepareReviewExporter } from './use-export';
import type { useReviewExport } from './use-export';
import { useReviewAudio } from './use-review-audio';
import type { useReviewEdits } from './use-edits';
import { useReviewEditorShortcuts } from './use-review-shortcuts';
import { useReviewSelectionLifecycle } from './use-review-selection';
import type { useReviewZoomEditor } from './zoom-editor';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/** Wires advanced lanes to the shared selection, flush, and export boundaries. */
export function useReviewEditorWiring(args: {
  session: Session;
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  advancedState: ReturnType<typeof useReviewAdvanced>;
  exporter: ReturnType<typeof useReviewExport>;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  activeSelection: ReviewSelection;
  setActiveSelection: Dispatch<SetStateAction<ReviewSelection>>;
  clearAnnotation: Dispatch<SetStateAction<ReviewAnnotation | null>>;
  time: number;
  timelineDuration: number;
  busy: boolean;
  canStart(): boolean;
  run(action: () => Promise<unknown>): Promise<unknown>;
  composer: ReturnType<typeof useReviewComposer>;
  video: RefObject<HTMLVideoElement | null>;
  seek(value: number, snap?: boolean): void;
  setTimelineSelection(value: import('../../features/video/review/types').ReviewAnchor): void;
  setCutting(cutting: false): void;
  telemetry: LoadedReview['telemetry'];
  sourceDuration: number;
  actionsVisible: boolean;
  play(): void;
  timelineSelection: ReviewAnchor;
  cuts: Pick<ReturnType<typeof useReviewEdits>, 'cutting' | 'setCutting' | 'remove' | 'toggle'>;
}) {
  const projected = useMemo(
    () =>
      args.telemetry
        ? projectReviewTelemetry(args.telemetry, args.sourceDuration, false)
        : { markers: [], warnings: 0 },
    [args.telemetry, args.sourceDuration]
  );
  const comments = useReviewCommentActions({
    composer: args.composer,
    video: args.video,
    seek: args.seek,
    setSelection: args.setTimelineSelection,
    setSelected: args.clearAnnotation,
    setCutting: args.setCutting,
    canStart: args.canStart,
    busy: args.busy,
    exporterPhase: args.exporter.phase,
  });
  const canvasComments = useCanvasComments({
    session: args.session,
    time: args.time,
    busy: args.busy,
    exporterPhase: args.exporter.phase,
    canStart: args.canStart,
    run: args.run,
    selectedId: args.activeSelection.kind === 'canvas-comment' ? args.activeSelection.id : null,
    onSelectionChange: (id) =>
      args.setActiveSelection(id ? { kind: 'canvas-comment', id } : { kind: 'none' }),
  });
  const audio = useReviewAudio({
    audio: args.advanced.audio,
    setAudio: args.advancedState.setAudio,
    timelineDuration: args.timelineDuration,
    sourceDuration: args.sourceDuration,
    edits: args.document.edits,
    selectedOriginalId:
      args.activeSelection.kind === 'original-audio' ? args.activeSelection.id : null,
    onOriginalSelection: (id) =>
      args.setActiveSelection(id ? { kind: 'original-audio', id } : { kind: 'none' }),
    selectedId: args.activeSelection.kind === 'audio' ? args.activeSelection.id : null,
    onSelectionChange: (value) =>
      args.setActiveSelection(value ? { kind: 'audio', ...value } : { kind: 'none' }),
  });
  useOriginalAudioToolLifecycle(args.advanced.ui.mode, args.activeSelection.kind, audio);
  const flushPendingContent = async () => {
    await args.advancedState.flush();
    await canvasComments.flushTexts();
    await args.session.flush();
  };
  const removeSelection = useReviewSelectionLifecycle({
    selection: args.activeSelection,
    markers: projected.markers,
    setSelection: args.setActiveSelection,
    document: args.document,
    advanced: args.advanced,
    commit: (operation) => args.session.commit(operation),
    run: args.run,
    deleteCanvas: (id) => {
      const comment = args.document.canvasComments.find((item) => item.id === id);
      if (comment) void canvasComments.onDelete(comment);
    },
    deleteZoom: args.zoom.remove,
    deleteZoomLink: (id) => args.zoom.change(id, { linkTo: null }),
    deleteAudio: audio.removeClip,
    deleteOriginalAudio: audio.removeOriginal,
    clearAnnotation: () => args.clearAnnotation(null),
  });
  const moveHistory = async (direction: 'undo' | 'redo') => {
    await flushPendingContent();
    await args.session.history(direction);
  };
  useReviewEditorShortcuts({
    time: args.time,
    seek: args.seek,
    play: args.play,
    composerAnnotation: args.composer.annotation,
    busy: args.busy,
    exporterPhase: args.exporter.phase,
    exporterAvailable: !!args.exporter.index,
    boundaries:
      args.cuts.cutting && args.exporter.index ? args.exporter.index.boundaries : undefined,
    run: args.run,
    undo: () => moveHistory('undo'),
    redo: () => moveHistory('redo'),
    cancelDrawing: () => {
      args.cuts.setCutting(false);
      audio.setOriginalTool(false);
      args.setTimelineSelection({ kind: 'point', time: args.time });
    },
    pointTool: () => {
      args.cuts.setCutting(false);
      audio.setOriginalTool(false);
    },
    remove: removeSelection,
    addComment: () => comments.add(args.timelineSelection),
    toggleCut: () => {
      if (audio.originalRangeSelected) return;
      audio.setOriginalTool(false);
      void args.cuts.toggle('cut');
    },
  });
  return {
    audio,
    canvasComments,
    comments,
    telemetry: args.telemetry ? args.actionsVisible : false,
    projected,
    flushPendingContent,
    moveHistory: (direction: 'undo' | 'redo') => void args.run(() => moveHistory(direction)),
    removeSelection,
    exporter: prepareReviewExporter(args.exporter, args.run, flushPendingContent),
  };
}

/** Clear the source-audio gesture target when another editor context takes over. */
function useOriginalAudioToolLifecycle(
  mode: QuickEditAdvancedState['ui']['mode'],
  selectionKind: ReviewSelection['kind'],
  { setOriginalTool, setOriginalRangeSelected }: ReturnType<typeof useReviewAudio>
) {
  useEffect(() => {
    if (mode === 'advanced' && (selectionKind === 'none' || selectionKind === 'original-audio'))
      return;
    setOriginalTool(false);
    setOriginalRangeSelected(false);
  }, [mode, selectionKind, setOriginalTool, setOriginalRangeSelected]);
}
