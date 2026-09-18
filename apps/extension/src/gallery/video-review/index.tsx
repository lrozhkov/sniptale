import { useEffect, useMemo, useRef, useState } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import {
  projectReviewTelemetry,
  type ReviewTelemetryMarker,
} from '../../features/video/review/telemetry';
import { ReviewButton } from './controls';
import { ReviewCanvasCommentsSection } from './comment-editor';
import { ReviewAudioInspectorSection } from './audio-editor';
import { ReviewStageBinding } from './stage-binding';
import { ReviewTimelineBinding } from './timeline-binding';
import { ReviewInspector } from './inspector';
import { ReviewComposer } from './composer';
import {
  useLoadedReview,
  useReviewComposer,
  useReviewSnapshot,
  type LoadedReview,
} from './use-session';
import { exportReviewReport } from './report-actions';
import { useReviewExport } from './use-export';
import { useReviewAdvanced } from './use-advanced';
import { ReviewEditActions } from './edit-actions';
import { useReviewPlayback } from './use-playback';
import { useReviewEdits } from './use-edits';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { ReviewAdvancedPanels } from './advanced-panels';
import { useCanvasComments } from './use-canvas-comments';
import { useReviewAudio } from './use-review-audio';
import { importAudioAsset, importedAudioClip } from '../../workflows/video-review/audio-import';
import { useReviewZoomEditor } from './zoom-editor';

function useReviewKeys({
  time,
  seek,
  play,
  cancelDrawing,
  boundaries,
  undo,
  redo,
  remove,
  add,
  tool,
}: {
  time: number;
  boundaries?: readonly number[];
  seek(value: number): void;
  play(): void;
  cancelDrawing(): void;
  undo(): void;
  redo(): void;
  remove(): void;
  add(): void;
  tool(key: 'c' | 'v'): void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDrawing();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input,textarea,select') || target.isContentEditable)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) play();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        add();
        return;
      }
      if (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'v') {
        event.preventDefault();
        tool(event.key.toLowerCase() === 'c' ? 'c' : 'v');
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const next = boundaries
          ? direction > 0
            ? boundaries.find((value) => value > time)
            : [...boundaries].reverse().find((value) => value < time)
          : time + direction * (event.shiftKey ? 1 : 0.1);
        seek(next ?? time);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
}

function useReviewTelemetryProjection(args: {
  telemetry: LoadedReview['telemetry'];
  duration: number;
  actionsVisible: boolean;
}) {
  const projected = useMemo(
    () =>
      args.telemetry
        ? projectReviewTelemetry(args.telemetry, args.duration, false)
        : { markers: [], warnings: 0 },
    [args.telemetry, args.duration]
  );
  return { telemetry: args.telemetry ? args.actionsVisible : false, projected };
}

function useReviewCommentActions(args: {
  composer: ReturnType<
    typeof import('../../workflows/video-review/session').createVideoReviewSession
  > extends never
    ? never
    : ReturnType<typeof useReviewComposer>;
  video: React.RefObject<HTMLVideoElement | null>;
  seek(value: number, snap?: boolean): void;
  setSelection(value: ReviewAnchor): void;
  setSelected(value: ReviewAnnotation | null): void;
  setCutting(cutting: false): void;
  canStart(): boolean;
  busy: boolean;
  exporterPhase: string;
}) {
  const select = (annotation: ReviewAnnotation) => {
    args.setCutting(false);
    args.video.current?.pause();
    args.setSelected(annotation);
    args.seek(
      annotation.anchor.kind === 'point' ? annotation.anchor.time : annotation.anchor.start,
      false
    );
    args.setSelection(annotation.anchor);
  };
  const add = (selection: ReviewAnchor, marker?: ReviewTelemetryMarker) => {
    if (args.busy || args.exporterPhase !== 'idle' || !args.canStart()) return;
    args.video.current?.pause();
    const anchor = marker ? { kind: 'point' as const, time: marker.start } : selection;
    args.seek(anchor.kind === 'point' ? anchor.time : anchor.start, false);
    args.composer.change(
      {
        id: crypto.randomUUID(),
        text: '',
        anchor,
        ...(marker ? { telemetryRef: marker.ref } : {}),
      },
      null
    );
    if (marker) {
      args.setCutting(false);
      args.seek(marker.start, false);
      args.setSelection(anchor);
    }
  };
  return { select, add };
}

function useReviewEditorShortcuts(args: {
  time: number;
  seek(value: number, snap?: boolean): void;
  play(): void;
  composerAnnotation: ReviewAnnotation | null;
  busy: boolean;
  exporterPhase: 'idle' | 'exporting' | 'publishing';
  exporterAvailable: boolean;
  boundaries: readonly number[] | undefined;
  run(action: () => Promise<unknown>): Promise<unknown>;
  session: ReturnType<
    typeof import('../../workflows/video-review/session').createVideoReviewSession
  >;
  cancelDrawing(): void;
  pointTool(): void;
  remove(): void;
  addComment(): void;
  toggleCut(): void;
}) {
  const editingBlocked = !!args.composerAnnotation;
  const exportBlocked = args.exporterPhase !== 'idle';
  useReviewKeys({
    time: args.time,
    seek: args.seek,
    play: args.play,
    cancelDrawing: args.cancelDrawing,
    undo: () => {
      if (!editingBlocked && !exportBlocked) void args.run(() => args.session.history('undo'));
    },
    redo: () => {
      if (!editingBlocked && !exportBlocked) void args.run(() => args.session.history('redo'));
    },
    remove: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) args.remove();
    },
    add: args.addComment,
    tool: (key) => {
      if (!editingBlocked && !args.busy && !exportBlocked) {
        if (key === 'v') args.pointTool();
        else if (args.exporterAvailable) args.toggleCut();
      }
    },
    ...(args.boundaries ? { boundaries: args.boundaries } : {}),
  });
}

function useReviewEditorState(resource: LoadedReview) {
  const { session, source } = resource;
  const snapshot = useReviewSnapshot(session);
  const composer = useReviewComposer(session);
  const exporter = useReviewExport(resource);
  const advancedState = useReviewAdvanced(session);
  const advanced = advancedState.advanced;
  const [selection, setSelection] = useState<ReviewAnchor>(
    composer.annotation?.anchor ?? { kind: 'point', time: 0 }
  );
  const [selected, setSelected] = useState<ReviewAnnotation | null>(null);
  const [hovered, setHovered] = useState<ReviewAnnotation | null>(null);
  const { busy, setBusy, message, setMessage, run } = useReviewActionStatus();
  const zoom = useReviewZoomEditor({
    setZoom: advancedState.setZoom,
    background: advanced.background,
  });
  const { video, time, onTime, playing, setPlaying, seek, play } = useReviewPlayback({
    duration: source.duration,
    edits: snapshot.document.edits,
    original: advanced.audio.original,
    boundaries: () => (cuts.cutting ? exporter.index?.boundaries : undefined),
    onSeek: (next) => {
      if (selection.kind === 'point') setSelection({ kind: 'point', time: next });
    },
    onFailure: () => setMessage(translate('gallery.videoReview.playbackFailed')),
  });
  const cuts = useReviewEdits({
    duration: source.duration,
    ...(exporter.index ? { boundaries: exporter.index.boundaries } : {}),
    edits: snapshot.document.edits,
    pause: () => video.current?.pause(),
    onInvalid: () => setMessage(translate('gallery.videoReview.invalidEditRange')),
    seek: (value) => seek(value),
    setSelection,
    commit: async (before, after) => {
      if (busy || exporter.phase !== 'idle' || !canStart()) return false;
      let committed = false;
      await run(async () => {
        await session.commit({
          id: crypto.randomUUID(),
          at: Date.now(),
          target: 'edit',
          before,
          after,
        });
        committed = true;
      });
      return committed;
    },
  });
  const { cutting, setCutting } = cuts;
  const editing = { ...cuts, exporter };
  const { telemetry, projected } = useReviewTelemetryProjection({
    telemetry: resource.telemetry,
    duration: source.duration,
    actionsVisible: advanced.ui.tracks.actions,
  });
  const canStart = () => {
    if (!composer.annotation) return true;
    setMessage(translate('gallery.videoReview.finishComment'));
    return false;
  };
  const comments = useReviewCommentActions({
    composer,
    video,
    seek,
    setSelection,
    setSelected,
    setCutting,
    canStart,
    busy,
    exporterPhase: exporter.phase,
  });
  useReviewEditorShortcuts({
    time,
    seek,
    play,
    composerAnnotation: composer.annotation,
    busy,
    exporterPhase: exporter.phase,
    exporterAvailable: !!exporter.index,
    boundaries: cutting && exporter.index ? exporter.index.boundaries : undefined,
    run,
    session,
    cancelDrawing: () => {
      cuts.setCutting(false);
      setSelection({ kind: 'point', time });
    },
    pointTool: () => cuts.setCutting(false),
    remove: () => cuts.remove(),
    addComment: () => comments.add(selection),
    toggleCut: () => cuts.toggle('cut'),
  });
  return {
    editing,
    session,
    source,
    snapshot,
    composer,
    video,
    time,
    onTime,
    playing,
    setPlaying,
    selection,
    setSelection,
    selected,
    setHovered,
    telemetry,
    advanced,
    setMode: advancedState.setMode,
    setTrackVisibility: advancedState.setTrackVisibility,
    zoom,
    setBackground: advancedState.setBackground,
    setAudio: advancedState.setAudio,
    resetAdvanced: advancedState.reset,
    flushAdvanced: advancedState.flush,
    projected,
    busy,
    setBusy,
    message,
    setMessage,
    seek,
    play,
    run,
    canStart,
    selectComment: comments.select,
    add: (marker?: ReviewTelemetryMarker) => comments.add(selection, marker),
    displayRegion: reviewRegion(
      time,
      composer.annotation,
      hovered,
      selected,
      snapshot.document.annotations
    ),
  };
}

/** Reports explicit UI action status separately from field recovery; the session serializes writes. */
function useReviewActionStatus() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
    } catch {
      setMessage(translate('gallery.videoReview.saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, setBusy, message, setMessage, run };
}

/** Draft and hover overlays take precedence; saved selections follow current history. */
function reviewRegion(
  time: number,
  draft: ReviewAnnotation | null,
  hovered: ReviewAnnotation | null,
  selected: ReviewAnnotation | null,
  annotations: readonly ReviewAnnotation[]
) {
  const annotation = draft ?? hovered ?? annotations.find((item) => item.id === selected?.id);
  return annotation &&
    (annotation.anchor.kind === 'point'
      ? Math.abs(annotation.anchor.time - time) < 0.05
      : time >= annotation.anchor.start && time <= annotation.anchor.end)
    ? annotation.region
    : undefined;
}

type InspectorState = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'editing'
  | 'session'
  | 'snapshot'
  | 'composer'
  | 'video'
  | 'time'
  | 'selected'
  | 'setHovered'
  | 'busy'
  | 'setBusy'
  | 'message'
  | 'setMessage'
  | 'seek'
  | 'run'
  | 'canStart'
  | 'selectComment'
  | 'add'
  | 'advanced'
  | 'zoom'
  | 'setBackground'
  | 'setAudio'
  | 'resetAdvanced'
  | 'flushAdvanced'
>;

function ReviewInspectorBinding({
  resource,
  state,
  canvasComments,
  audio,
  onBack,
}: {
  resource: LoadedReview;
  state: InspectorState;
  canvasComments: ReturnType<typeof useCanvasComments>;
  audio: ReturnType<typeof useReviewAudio>;
  onBack(): void;
}) {
  const {
    editing,
    session,
    snapshot,
    composer,
    video,
    selected,
    setHovered,
    busy,
    setBusy,
    message,
    setMessage,
    run,
    canStart,
    selectComment,
    add,
    advanced,
    zoom,
    setBackground,
    resetAdvanced,
    flushAdvanced,
  } = state;
  const errorKey: Parameters<typeof translate>[0] =
    snapshot.error === 'conflict'
      ? 'gallery.videoReview.conflict'
      : snapshot.error === 'changed-source'
        ? 'gallery.videoReview.sourceChanged'
        : snapshot.error === 'missing-media'
          ? 'gallery.videoReview.missingMedia'
          : 'gallery.videoReview.saveFailed';
  return (
    <ReviewInspector
      filename={resource.filename}
      annotations={snapshot.document.annotations}
      selectedId={selected?.id ?? null}
      busy={busy || editing.exporter.phase !== 'idle'}
      actions={
        <ReviewEditActions
          available={!!editing.exporter.index && editing.exporter.index.boundaries.length >= 2}
          hasEdits={snapshot.document.edits.length > 0}
          busy={busy || !!composer.annotation}
          phase={editing.exporter.phase}
          progress={editing.exporter.progress}
          failed={editing.exporter.failed}
          hasResult={!!editing.exporter.result}
          audioUnavailable={
            !!editing.exporter.index?.audioCodec &&
            !editing.exporter.index.processedAudioCodec &&
            snapshot.document.edits.some((edit) => edit.kind === 'speed')
          }
          onExport={() => {
            video.current?.pause();
            void editing.exporter.start();
          }}
          onCancel={editing.exporter.cancel}
          onDownload={editing.exporter.download}
        />
      }
      canUndo={!composer.annotation && snapshot.snapshot.workspace.cursor > 0}
      canRedo={
        !composer.annotation &&
        snapshot.snapshot.workspace.cursor < snapshot.snapshot.workspace.history.length
      }
      canvas={
        <>
          <ReviewCanvasCommentsSection
            {...canvasComments}
            comments={snapshot.document.canvasComments}
            busy={busy}
          />
          <ReviewAudioInspectorSection audio={audio} busy={busy} />
        </>
      }
      message={snapshot.error ? translate(errorKey) : message}
      onBack={() => {
        video.current?.pause();
        void run(async () => {
          await composer.flush();
          await flushAdvanced();
          await session.flush();
          onBack();
        });
      }}
      onUndo={() => void run(() => session.history('undo'))}
      onRedo={() => void run(() => session.history('redo'))}
      onAdd={() => add()}
      onSelect={selectComment}
      onHover={setHovered}
      onEdit={(annotation) => {
        if (canStart()) {
          selectComment(annotation);
          composer.change(annotation, annotation);
        }
      }}
      onDelete={(annotation) => {
        if (canStart())
          void run(() =>
            session.commit({
              id: crypto.randomUUID(),
              at: Date.now(),
              target: 'annotation',
              before: annotation,
              after: null,
            })
          );
      }}
      onReport={(action) => {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        void exportReviewReport(resource, action, editing.exporter.result?.receipt)
          .catch(() => setMessage(translate('gallery.videoReview.reportFailed')))
          .finally(() => setBusy(false));
      }}
    >
      <ReviewAdvancedPanels advanced={advanced} zoom={zoom} setBackground={setBackground} />
      {snapshot.error === 'conflict' ? (
        <ReviewButton
          label={translate('gallery.videoReview.reload')}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await composer.reload();
              resetAdvanced();
            })
          }
        />
      ) : null}
      {composer.annotation ? (
        <ReviewCommentComposer state={state} annotation={composer.annotation} />
      ) : null}
    </ReviewInspector>
  );
}

function ReviewCommentComposer({
  state,
  annotation,
}: {
  state: Pick<InspectorState, 'composer' | 'busy' | 'run'>;
  annotation: ReviewAnnotation;
}) {
  const { composer, busy, run } = state;
  return (
    <ReviewComposer
      key={annotation.id}
      annotation={annotation}
      busy={busy}
      onChange={composer.change}
      onSave={() => void run(composer.save)}
      onDiscard={() => void run(composer.discard)}
    />
  );
}

function ReviewEditor({ resource, onBack }: { resource: LoadedReview; onBack(): void }) {
  const state = useReviewEditorState(resource);
  const audio = useReviewAudio({
    audio: state.advanced.audio,
    setAudio: state.setAudio,
    timelineDuration: state.source.duration,
  });
  const onImportAudioFile = (file: File) => {
    if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
    void state.run(async () => {
      const imported = await importAudioAsset(file);
      audio.addImported(
        importedAudioClip(imported.assetId, imported.duration, state.time, state.source.duration),
        'music'
      );
    });
  };
  const canvasComments = useCanvasComments({
    session: state.session,
    time: state.time,
    busy: state.busy,
    exporterPhase: state.editing.exporter.phase,
    canStart: state.canStart,
    run: state.run,
  });
  const {
    editing,
    source,
    snapshot,
    composer,
    video,
    time,
    onTime,
    playing,
    setPlaying,
    selection,
    setSelection,
    selected,
    telemetry,
    advanced,
    setMode,
    setTrackVisibility,
    zoom,
    busy,
    setMessage,
    projected,
    seek,
    play,
    selectComment,
    add,
    displayRegion,
  } = state;
  const features = useMemo(() => resolveQuickEditEffectiveFeatures(advanced), [advanced]);
  return (
    <div
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] max-[799px]:grid-cols-1
          max-[799px]:grid-rows-[minmax(360px,45%)_minmax(440px,1fr)]
          max-[799px]:overflow-y-auto"
    >
      <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-4">
        <ReviewStageBinding
          url={resource.url}
          source={source}
          video={video}
          drawing={!!composer.annotation && !playing && !busy}
          region={displayRegion}
          zoom={features.zoomTrackVisible ? advanced.zoom : null}
          zoomOverlay={(() => {
            const zoomRegion = features.zoomTrackVisible ? zoom.selected(advanced.zoom) : null;
            return zoomRegion ? zoom.focusOverlay(zoomRegion) : undefined;
          })()}
          comments={snapshot.document.canvasComments}
          canvasComments={canvasComments}
          time={time}
          background={advanced.background}
          busy={busy}
          onRegion={(region) => {
            if (composer.annotation && !busy) composer.change({ ...composer.annotation, region });
          }}
          onReady={() => {
            const anchor = composer.annotation?.anchor;
            if (anchor) seek(anchor.kind === 'point' ? anchor.time : anchor.start);
          }}
          onTime={(value) => {
            const next = onTime(value);
            setSelection((current) =>
              current.kind === 'point' ? { kind: 'point', time: next } : current
            );
          }}
          onPlaying={setPlaying}
          onError={() => setMessage(translate('gallery.videoReview.playbackFailed'))}
        />
        <ReviewTimelineBinding
          editing={editing}
          edits={snapshot.document.edits}
          annotations={snapshot.document.annotations}
          source={source}
          volume={advanced.audio.original.volume}
          onVolume={(value) => audio.setOriginal({ volume: value })}
          busy={busy}
          composerBusy={!!composer.annotation}
          selection={selection}
          setSelection={setSelection}
          advanced={advanced}
          setMode={setMode}
          setTrackVisibility={setTrackVisibility}
          telemetryAvailable={!!resource.telemetry}
          time={time}
          playing={playing}
          markers={telemetry ? projected.markers : []}
          selectedTelemetryRef={selected?.telemetryRef}
          zoom={zoom}
          canvasComments={canvasComments}
          audio={audio}
          audioState={advanced.audio}
          audioVisible={features.audioTrackVisible}
          onImportAudioFile={onImportAudioFile}
          onAddComment={add}
          onComment={selectComment}
          onSeek={seek}
          onPlay={play}
        />
      </main>
      <ReviewInspectorBinding
        resource={resource}
        state={state}
        canvasComments={canvasComments}
        audio={audio}
        onBack={onBack}
      />
    </div>
  );
}

/** Native modal owns focus/inert; Escape cancels drawing, Back alone exits after recovery flush. */
export function VideoReview({ aggregateId, onBack }: { aggregateId: string; onBack(): void }) {
  useAppLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const { resource, failed, retry } = useLoadedReview(aggregateId);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={translate('gallery.videoReview.title')}
      onCancel={(event) => event.preventDefault()}
      style={{
        backgroundColor: 'var(--sniptale-color-surface-canvas)',
        backgroundImage:
          'linear-gradient(var(--sniptale-color-surface-panel), var(--sniptale-color-surface-panel))',
      }}
      className="fixed inset-0 m-auto h-[calc(100dvh-24px)] max-h-none w-[calc(100vw-24px)] max-w-none
          overflow-hidden rounded-[var(--sniptale-radius-lg)] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
          p-0 text-[var(--sniptale-color-text-primary)] backdrop:bg-black/60"
    >
      {resource ? (
        <ReviewEditor resource={resource} onBack={onBack} />
      ) : (
        <div className="space-y-4 p-4">
          <ReviewButton label={translate('gallery.videoReview.back')} onClick={onBack} />
          <p role={failed ? 'alert' : 'status'}>
            {translate(failed ? 'gallery.videoReview.loadFailed' : 'gallery.videoReview.loading')}
          </p>
          {failed ? (
            <ReviewButton label={translate('gallery.videoReview.retry')} onClick={retry} />
          ) : null}
        </div>
      )}
    </dialog>
  );
}
