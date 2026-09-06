import { useEffect, useMemo, useRef, useState } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import {
  projectReviewTelemetry,
  type ReviewTelemetryMarker,
} from '../../features/video/review/telemetry';
import { ReviewButton } from './controls';
import { ReviewStage } from './stage';
import { ReviewTimeline } from './timeline';
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
import { ReviewEditActions, ReviewTimelineTools } from './edit-actions';
import { Activity, MessageSquarePlus } from 'lucide-react';
import { nearestReviewBoundary } from '../../features/video/review/cuts';
import { useReviewPlayback } from './use-playback';
import { useReviewEdits } from './use-edits';

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

function useReviewEditorState(resource: LoadedReview) {
  const { session, source } = resource;
  const snapshot = useReviewSnapshot(session);
  const composer = useReviewComposer(session);
  const exporter = useReviewExport(resource);
  const [selection, setSelection] = useState<ReviewAnchor>(
    composer.annotation?.anchor ?? { kind: 'point', time: 0 }
  );
  const [selected, setSelected] = useState<ReviewAnnotation | null>(null);
  const [hovered, setHovered] = useState<ReviewAnnotation | null>(null);
  const [telemetry, setTelemetry] = useState(!!resource.telemetry);
  const { busy, setBusy, message, setMessage, run } = useReviewActionStatus();
  const projected = useMemo(
    () =>
      resource.telemetry
        ? projectReviewTelemetry(resource.telemetry, source.duration, false)
        : { markers: [], warnings: 0 },
    [resource.telemetry, source.duration]
  );
  const { video, time, onTime, playing, setPlaying, seek, play, volume, setVolume } =
    useReviewPlayback({
      duration: source.duration,
      edits: snapshot.document.edits,
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
  const canStart = () => {
    if (!composer.annotation) return true;
    setMessage(translate('gallery.videoReview.finishComment'));
    return false;
  };
  const selectComment = (annotation: ReviewAnnotation) => {
    setCutting(false);
    video.current?.pause();
    setSelected(annotation);
    seek(
      annotation.anchor.kind === 'point' ? annotation.anchor.time : annotation.anchor.start,
      false
    );
    setSelection(annotation.anchor);
  };
  const add = (marker?: ReviewTelemetryMarker) => {
    if (busy || exporter.phase !== 'idle' || !canStart()) return;
    video.current?.pause();
    setMessage(null);
    const anchor = marker ? { kind: 'point' as const, time: marker.start } : selection;
    seek(anchor.kind === 'point' ? anchor.time : anchor.start, false);
    composer.change(
      {
        id: crypto.randomUUID(),
        text: '',
        anchor,
        ...(marker ? { telemetryRef: marker.ref } : {}),
      },
      null
    );
    if (marker) {
      setCutting(false);
      seek(marker.start, false);
      setSelection(anchor);
    }
  };
  useReviewKeys({
    time,
    seek,
    play,
    cancelDrawing: () => {
      cuts.setCutting(false);
      setSelection({ kind: 'point', time });
    },
    undo: () => {
      if (!composer.annotation && exporter.phase === 'idle')
        void run(() => session.history('undo'));
    },
    redo: () => {
      if (!composer.annotation && exporter.phase === 'idle')
        void run(() => session.history('redo'));
    },
    remove: () => {
      if (!composer.annotation && !busy && exporter.phase === 'idle') cuts.remove();
    },
    add: () => add(),
    tool: (key) => {
      if (!composer.annotation && !busy && exporter.phase === 'idle') {
        if (key === 'v') cuts.setCutting(false);
        else if (exporter.index) cuts.toggle('cut');
      }
    },
    ...(cutting && exporter.index ? { boundaries: exporter.index.boundaries } : {}),
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
    volume,
    setVolume,
    playing,
    setPlaying,
    selection,
    setSelection,
    selected,
    setHovered,
    telemetry,
    setTelemetry,
    projected,
    busy,
    setBusy,
    message,
    setMessage,
    seek,
    play,
    run,
    canStart,
    selectComment,
    add,
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
>;

function ReviewInspectorBinding({
  resource,
  state,
  onBack,
}: {
  resource: LoadedReview;
  state: InspectorState;
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
      message={snapshot.error ? translate(errorKey) : message}
      onBack={() => {
        video.current?.pause();
        void run(async () => {
          await composer.flush();
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
      {snapshot.error === 'conflict' ? (
        <ReviewButton
          label={translate('gallery.videoReview.reload')}
          disabled={busy}
          onClick={() => void run(composer.reload)}
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
  const {
    editing,
    source,
    snapshot,
    composer,
    video,
    time,
    onTime,
    volume,
    setVolume,
    playing,
    setPlaying,
    selection,
    setSelection,
    telemetry,
    setTelemetry,
    busy,
    setMessage,
    projected,
    seek,
    play,
    selectComment,
    add,
    displayRegion,
  } = state;
  return (
    <div
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] max-[799px]:grid-cols-1
          max-[799px]:grid-rows-[minmax(360px,45%)_minmax(440px,1fr)]
          max-[799px]:overflow-y-auto"
    >
      <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-4">
        <ReviewStage
          url={resource.url}
          source={source}
          video={video}
          drawing={!!composer.annotation && !playing && !busy}
          region={displayRegion}
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
        <ReviewTimeline
          duration={source.duration}
          volume={volume}
          onVolume={setVolume}
          tools={
            <>
              <ReviewTimelineTools
                mode={editing.mode}
                available={!!editing.exporter.index}
                busy={busy || !!composer.annotation || editing.exporter.phase !== 'idle'}
                rate={editing.rate}
                audio={editing.audio}
                selected={!!editing.selected}
                onPointer={() => editing.setCutting(false)}
                onToggle={editing.toggle}
                onRate={editing.changeRate}
                onAudio={editing.changeAudio}
                onRemove={editing.remove}
              />
              <ReviewButton
                label={translate(
                  selection.kind === 'range'
                    ? 'gallery.videoReview.commentRange'
                    : 'gallery.videoReview.addComment'
                )}
                disabled={busy || !!composer.annotation}
                onClick={() => add()}
                className="!border-0 !bg-transparent !shadow-none !text-xs"
              >
                <MessageSquarePlus size={16} />
                <span className="hidden @[720px]:inline">
                  {translate(
                    selection.kind === 'range'
                      ? 'gallery.videoReview.commentRange'
                      : 'gallery.videoReview.commentText'
                  )}
                </span>
              </ReviewButton>
              {resource.telemetry ? (
                <ReviewButton
                  label={translate('gallery.videoReview.telemetry')}
                  aria-pressed={telemetry}
                  className="!border-0 !bg-transparent !shadow-none
                      aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
                  onClick={() => setTelemetry(!telemetry)}
                >
                  <Activity size={16} />
                </ReviewButton>
              ) : null}
            </>
          }
          {...(editing.exporter.index ? { boundaries: editing.exporter.index.boundaries } : {})}
          onRangeCommit={(range) => {
            if (editing.mode) void editing.commitRange(range);
          }}
          onChangeEdit={(edit, range) => void editing.commitRange(range, edit)}
          time={time}
          playing={playing}
          selection={
            editing.cutting && editing.exporter.index && selection.kind === 'range'
              ? {
                  kind: 'range',
                  start: nearestReviewBoundary(selection.start, editing.exporter.index.boundaries),
                  end: nearestReviewBoundary(selection.end, editing.exporter.index.boundaries),
                }
              : selection
          }
          edits={snapshot.document.edits}
          onEdit={editing.select}
          annotations={snapshot.document.annotations}
          markers={telemetry ? projected.markers : []}
          onSeek={seek}
          onSelect={setSelection}
          onPlay={play}
          onMarker={add}
          onComment={selectComment}
        />
      </main>
      <ReviewInspectorBinding resource={resource} state={state} onBack={onBack} />
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
