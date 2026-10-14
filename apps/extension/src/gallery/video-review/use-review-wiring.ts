import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { reviewCursorFocusTimelineKeys } from '../../features/video/project/cursor-focus-path/timeline';
import { resolveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import { deleteCursorFocusKey } from '../../features/video/project/cursor-focus-path/authoring';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import type { ReviewBeforeAction } from './note-transitions';
import { createReviewHistoryActions } from './history-actions';
import {
  useMemo,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
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
import { reviewTimelineNavigationBounds } from './track-projection';
import { useReviewSelectionLifecycle } from './use-review-selection';
import type { useReviewZoomEditor } from './zoom-editor';
import { removeReviewWebcamItem } from './webcam-editor';
import { useReviewText } from './use-review-text';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/** Project recorded observations together with their capture coverage for both history views. */
function projectHistory(telemetry: LoadedReview['telemetry'], duration: number) {
  const history = telemetry
    ? projectReviewTelemetry(telemetry, duration, true)
    : { markers: [], warnings: 0 };
  return { ...history, captureCapabilities: telemetry?.capabilities ?? null };
}

/** Wires advanced lanes to the shared selection, flush, and export boundaries. */
export function useReviewEditorWiring(args: {
  session: Session;
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  advancedState: ReturnType<typeof useReviewAdvanced>;
  exporter: ReturnType<typeof useReviewExport>;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  annotationEffects: ReturnType<typeof useReviewAnnotationEffects>;
  activeSelection: ReviewSelection;
  setActiveSelection: Dispatch<SetStateAction<ReviewSelection>>;
  clearAnnotation: Dispatch<SetStateAction<ReviewAnnotation | null>>;
  time: number;
  timelineDuration: number;
  beforeAction?: ReviewBeforeAction;
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
  sourceGeometry?: { width: number; height: number };
  actionsVisible: boolean;
  play(): void;
  timelineSelection: ReviewAnchor;
  cuts: Pick<ReturnType<typeof useReviewEdits>, 'cutting' | 'setCutting' | 'remove' | 'toggle'>;
}) {
  const annotationToolCancellation = useRef<(() => void) | null>(null);
  const cancelAnnotationTool = () => annotationToolCancellation.current?.();
  const projected = useMemo(
    () => projectHistory(args.telemetry, args.sourceDuration),
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
    voiceoverEnabled: resolveQuickEditEffectiveFeatures(args.advanced).voiceoverApplied,
    edits: args.document.edits,
    selectedOriginalId:
      args.activeSelection.kind === 'original-audio' ? args.activeSelection.id : null,
    onOriginalSelection: (id) => {
      if (id) args.setTimelineSelection({ kind: 'point', time: args.time });
      args.setActiveSelection(id ? { kind: 'original-audio', id } : { kind: 'none' });
    },
    selectedId: args.activeSelection.kind === 'audio' ? args.activeSelection.id : null,
    onSelectionChange: (value) =>
      args.setActiveSelection(value ? { kind: 'audio', ...value } : { kind: 'none' }),
  });
  useOriginalAudioToolLifecycle(args.activeSelection.kind, audio);
  const text = useReviewText({
    captions: args.advanced.captions,
    document: args.advanced.text,
    snapshots: args.advanced.audio.voiceover.flatMap((clip) =>
      clip.textSnapshot ? [clip.textSnapshot] : []
    ),
    selection: args.activeSelection,
    setText: args.advancedState.setText,
    endTyping: args.advancedState.endTyping,
    sourceDuration: args.sourceDuration,
    edits: args.document.edits,
    sourceTime: args.time,
    beforeAction: args.beforeAction,
    select: args.setActiveSelection,
    seek: args.seek,
    pause: () => args.video.current?.pause(),
  });
  const { cursorFocusPath, cursorFocusKeys } = useReviewCursorFocus(args);
  const removeSelection = useReviewSelectionLifecycle({
    selection: args.activeSelection,
    markers: projected.markers,
    cursorFocusPath,
    deleteCursorFocus: (id) =>
      args.advancedState.setCursorFocusPath(deleteCursorFocusKey(cursorFocusPath, id)),
    setSelection: args.setActiveSelection,
    document: args.document,
    advanced: args.advanced,
    commit: (operation) => args.session.commit(operation),
    run: args.run,
    deleteCanvas: (id) => {
      const comment = args.document.canvasComments.find((item) => item.id === id);
      if (comment) void canvasComments.onDelete(comment);
    },
    deleteAnnotationEffect: args.annotationEffects.remove,
    deleteText: (id) => text.remove([id]),
    deleteZoom: args.zoom.remove,
    deleteZoomLink: (id) => args.zoom.change(id, { linkTo: null }),
    deleteAudio: audio.removeClip,
    deleteOriginalAudio: audio.removeOriginal,
    deleteWebcam: (selection) =>
      args.advancedState.setWebcam((camera) =>
        camera ? removeReviewWebcamItem(camera, selection) : camera
      ),
    clearAnnotation: () => args.clearAnnotation(null),
  });
  const history = createReviewHistoryActions({
    session: args.session,
    run: args.run,
    flushStaged: async () => {
      await args.advancedState.flush();
      await canvasComments.flushTexts();
    },
    reset: () => resetReviewEditor(args, audio, canvasComments, cancelAnnotationTool),
  });
  useWiredReviewShortcuts(args, audio, comments, history, removeSelection, cancelAnnotationTool);
  return {
    annotationToolCancellation,
    text,
    audio,
    canvasComments,
    comments,
    telemetry: args.telemetry ? args.actionsVisible : false,
    projected,
    cursorFocusPath,
    cursorFocusKeys,
    flushPendingContent: history.flush,
    moveHistory: history.run,
    removeSelection,
    exporter: prepareReviewExporter(args.exporter, args.run, history.flush, () =>
      args.video.current?.pause()
    ),
  };
}

/** Keyboard commands use the same note admission and complete tool reset as pointer controls. */
function useWiredReviewShortcuts(
  args: Parameters<typeof useReviewEditorWiring>[0],
  audio: ReturnType<typeof useReviewAudio>,
  comments: ReturnType<typeof useReviewCommentActions>,
  history: ReturnType<typeof createReviewHistoryActions>,
  removeSelection: () => void,
  cancelAnnotationTool: () => void
) {
  useReviewEditorShortcuts({
    time: args.time,
    navigation: reviewTimelineNavigationBounds(args.sourceDuration, args.document.edits),
    seek: args.seek,
    play: args.play,
    composerAnnotation: args.composer.before,
    beforeAction: args.beforeAction,
    busy: args.busy,
    exporterPhase: args.exporter.phase,
    exporterAvailable: !!args.exporter.index,
    boundaries:
      args.cuts.cutting && args.exporter.index ? args.exporter.index.boundaries : undefined,
    run: args.run,
    undo: () => history.move('undo'),
    redo: () => history.move('redo'),
    cancelDrawing: () => {
      selectReviewPointer(args, audio, cancelAnnotationTool);
      args.setTimelineSelection({ kind: 'point', time: args.time });
    },
    pointTool: () => selectReviewPointer(args, audio, cancelAnnotationTool),
    remove: removeSelection,
    addComment: () => comments.add(args.timelineSelection),
    toggleCut: () => {
      if (audio.originalRangeSelected && args.activeSelection.kind === 'none') return;
      cancelAnnotationTool();
      args.zoom.setDrawing(false);
      audio.setOriginalTool(false);
      audio.setOriginalRangeSelected(false);
      void args.cuts.toggle('cut');
    },
  });
}

/** Pointer selection and Escape reset every mounted disposable drawing tool. */
function selectReviewPointer(
  { cuts, zoom }: Pick<Parameters<typeof useReviewEditorWiring>[0], 'cuts' | 'zoom'>,
  audio: Pick<ReturnType<typeof useReviewAudio>, 'setOriginalTool'>,
  cancelAnnotationTool: () => void
): void {
  cancelAnnotationTool();
  zoom.setDrawing(false);
  cuts.setCutting(false);
  audio.setOriginalTool(false);
}

/** Clear the source-audio gesture target when another editor context takes over. */
function useOriginalAudioToolLifecycle(
  selectionKind: ReviewSelection['kind'],
  { setOriginalTool, setOriginalRangeSelected }: ReturnType<typeof useReviewAudio>
) {
  useEffect(() => {
    if (selectionKind === 'none' || selectionKind === 'original-audio') return;
    setOriginalTool(false);
    setOriginalRangeSelected(false);
  }, [selectionKind, setOriginalTool, setOriginalRangeSelected]);
}

/** Flush staged content before the atomic reset, then restore disposable editor tools. */
async function resetReviewEditor(
  args: Parameters<typeof useReviewEditorWiring>[0],
  audio: ReturnType<typeof useReviewAudio>,
  canvasComments: ReturnType<typeof useCanvasComments>,
  cancelAnnotationTool: () => void
) {
  args.video.current?.pause();
  await args.advancedState.flush();
  await canvasComments.flushTexts();
  await args.session.reset();
  args.advancedState.reset();
  selectReviewPointer(args, audio, cancelAnnotationTool);
  args.setActiveSelection({ kind: 'none' });
  args.clearAnnotation(null);
  args.setTimelineSelection({ kind: 'point', time: 0 });
  args.seek(0, false);
}

function useReviewCursorFocus(args: Parameters<typeof useReviewEditorWiring>[0]) {
  const cursorFocusPath = useMemo(
    () =>
      resolveReviewCursorFocusPath(
        args.telemetry,
        {
          width:
            args.sourceGeometry?.width ??
            args.session.getSnapshot().snapshot.workspace.source.width,
          height:
            args.sourceGeometry?.height ??
            args.session.getSnapshot().snapshot.workspace.source.height,
          duration: args.sourceDuration,
        },
        args.advanced.cursorFocusPath
      ),
    [
      args.telemetry,
      args.sourceGeometry,
      args.sourceDuration,
      args.advanced.cursorFocusPath,
      args.session,
    ]
  );
  const cursorFocusKeys = useMemo(
    () => reviewCursorFocusTimelineKeys(cursorFocusPath),
    [cursorFocusPath]
  );
  return { cursorFocusPath, cursorFocusKeys };
}
