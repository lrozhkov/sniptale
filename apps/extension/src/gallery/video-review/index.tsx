import { useEffect, useMemo, useRef, useState } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
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
import { ReviewEditActions } from './edit-actions';
import {
  createReviewCut,
  nearestReviewBoundary,
  reviewPlaybackTime,
} from '../../features/video/review/cuts';

function useReviewKeys({
  time,
  seek,
  play,
  cancelDrawing,
  boundaries,
}: {
  time: number;
  boundaries?: readonly number[];
  seek(value: number): void;
  play(): void;
  cancelDrawing(): void;
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
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === ' ' && !(target instanceof HTMLElement && target.closest('button'))) {
        event.preventDefault();
        play();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const next = boundaries
          ? direction > 0
            ? boundaries.find((value) => value > time)
            : [...boundaries].reverse().find((value) => value < time)
          : time + direction;
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
  const [drawing, setDrawing] = useState(false);
  const [telemetry, setTelemetry] = useState(!!resource.telemetry);
  const [cursor, setCursor] = useState(false);
  const { busy, setBusy, message, setMessage, run } = useReviewActionStatus();
  const projected = useMemo(
    () =>
      resource.telemetry
        ? projectReviewTelemetry(resource.telemetry, source.duration, cursor)
        : { markers: [], warnings: 0 },
    [resource.telemetry, source.duration, cursor]
  );
  const { video, time, setTime, playing, setPlaying, seek, play } = useReviewPlayback({
    duration: source.duration,
    edits: snapshot.document.edits,
    boundaries: () => (cuts.cutting ? exporter.index?.boundaries : undefined),
    onSeek: (next) => {
      if (selection.kind === 'point') setSelection({ kind: 'point', time: next });
    },
    onPlay: () => setDrawing(false),
    onFailure: () => setMessage(translate('gallery.videoReview.playbackFailed')),
  });
  const cuts = useReviewCuts({
    duration: source.duration,
    ...(exporter.index ? { boundaries: exporter.index.boundaries } : {}),
    edits: snapshot.document.edits,
    selection,
    time,
    pause: () => video.current?.pause(),
    seek: (value) => seek(value),
    setSelection,
    commit: async (before, after) => {
      if (!canStart()) return false;
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
    setDrawing(false);
    setSelected(annotation);
    seek(
      annotation.anchor.kind === 'point' ? annotation.anchor.time : annotation.anchor.start,
      false
    );
    setSelection(annotation.anchor);
  };
  const add = (marker?: ReviewTelemetryMarker) => {
    if (!canStart()) return;
    video.current?.pause();
    setDrawing(false);
    setMessage(null);
    const anchor = marker ? { kind: 'point' as const, time: marker.start } : selection;
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
    cancelDrawing: () => setDrawing(false),
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
    setTime,
    playing,
    setPlaying,
    selection,
    setSelection,
    selected,
    setHovered,
    drawing,
    setDrawing,
    telemetry,
    setTelemetry,
    cursor,
    setCursor,
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
  return annotation?.anchor.kind === 'point' && Math.abs(annotation.anchor.time - time) < 0.05
    ? annotation.region
    : undefined;
}

/** Coordinates original media with source-time navigation and edited playback. */
function useReviewPlayback(props: {
  duration: number;
  edits: readonly ReviewEdit[];
  boundaries(): readonly number[] | undefined;
  onSeek(value: number): void;
  onPlay(): void;
  onFailure(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  return {
    video,
    time,
    setTime,
    playing,
    setPlaying,
    seek: (value: number, snap = true) => {
      const clamped = Math.max(0, Math.min(props.duration, value));
      const boundaries = snap ? props.boundaries() : undefined;
      const next = boundaries ? nearestReviewBoundary(clamped, boundaries) : clamped;
      if (video.current) video.current.currentTime = next;
      setTime(next);
      props.onSeek(next);
    },
    play: () => {
      if (!video.current) return;
      props.onPlay();
      if (video.current.paused) {
        video.current.currentTime = reviewPlaybackTime(video.current.currentTime, props.edits);
        void video.current.play().catch(props.onFailure);
      } else video.current.pause();
    },
  };
}

/** Owns the active cut selection; durable operations still go through the review session. */
function useReviewCuts(props: {
  duration: number;
  boundaries?: readonly number[];
  edits: readonly ReviewEdit[];
  selection: ReviewAnchor;
  time: number;
  pause(): void;
  seek(value: number): void;
  setSelection(value: ReviewAnchor): void;
  commit(before: ReviewEdit | null, after: ReviewEdit | null): Promise<boolean>;
}) {
  const [cutting, setCutting] = useState(false);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const candidate = props.boundaries
    ? createReviewCut({
        id: 'selection',
        selection: props.selection,
        boundaries: props.boundaries,
        duration: props.duration,
        edits: props.edits,
      })
    : null;
  const selected = props.edits.find((edit) => edit.id === selectedEditId) ?? null;
  return {
    cutting,
    setCutting,
    candidate,
    selected,
    select: (edit: ReviewEdit) => {
      props.pause();
      setSelectedEditId(edit.id);
      props.setSelection({ kind: 'range', start: edit.start, end: edit.end });
      props.seek(edit.start);
    },
    toggle: () => {
      props.pause();
      setCutting(!cutting);
      setSelectedEditId(null);
      if (!cutting && props.boundaries && props.selection.kind === 'point') {
        const start = nearestReviewBoundary(props.time, props.boundaries);
        const end = props.boundaries.find((value) => value > start) ?? props.duration;
        props.setSelection({ kind: 'range', start, end });
      }
    },
    apply: async () => {
      if (!candidate) return;
      const cut = { ...candidate, id: crypto.randomUUID() };
      if (await props.commit(null, cut)) setSelectedEditId(cut.id);
    },
    remove: () => {
      if (selected) void props.commit(selected, null);
    },
  };
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
  | 'drawing'
  | 'setDrawing'
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
          indexing={editing.exporter.indexing}
          available={!!editing.exporter.index && editing.exporter.index.boundaries.length > 2}
          cutting={editing.cutting}
          cut={editing.candidate}
          selected={editing.selected}
          hasEdits={snapshot.document.edits.length > 0}
          busy={busy || !!composer.annotation}
          phase={editing.exporter.phase}
          progress={editing.exporter.progress}
          failed={editing.exporter.failed}
          hasResult={!!editing.exporter.result}
          onToggle={editing.toggle}
          onCut={editing.apply}
          onRemove={editing.remove}
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
          void run(
            () =>
              session.commit({
                id: crypto.randomUUID(),
                at: Date.now(),
                target: 'annotation',
                before: annotation,
                after: null,
              }),
            translate('gallery.videoReview.commentDeleted')
          );
      }}
      onReport={(action) => {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        void exportReviewReport(resource, action, editing.exporter.result?.receipt)
          .then(() =>
            setMessage(
              translate(
                action === 'copy'
                  ? 'gallery.videoReview.reportCopied'
                  : 'gallery.videoReview.reportReady'
              )
            )
          )
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
  state: Pick<
    InspectorState,
    'composer' | 'busy' | 'drawing' | 'run' | 'setDrawing' | 'video' | 'seek' | 'time'
  >;
  annotation: ReviewAnnotation;
}) {
  const { composer, busy, drawing, run, setDrawing, video, seek, time } = state;
  return (
    <ReviewComposer
      key={annotation.id}
      annotation={annotation}
      busy={busy}
      saving={composer.saving}
      dirty={composer.dirty}
      drawing={drawing}
      onChange={composer.change}
      onSave={() =>
        void run(async () => {
          await composer.save();
          setDrawing(false);
        }, translate('gallery.videoReview.committed'))
      }
      onDiscard={() =>
        void run(async () => {
          await composer.discard();
          setDrawing(false);
        })
      }
      onDraw={() => {
        video.current?.pause();
        seek(annotation.anchor.kind === 'point' ? annotation.anchor.time : time);
        setDrawing(!drawing);
      }}
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
    setTime,
    playing,
    setPlaying,
    selection,
    setSelection,
    drawing,
    setDrawing,
    telemetry,
    setTelemetry,
    cursor,
    setCursor,
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
          drawing={drawing && !busy}
          region={displayRegion}
          onRegion={(region) => {
            if (composer.annotation && !busy) composer.change({ ...composer.annotation, region });
            setDrawing(false);
          }}
          onReady={() => {
            const anchor = composer.annotation?.anchor;
            if (anchor) seek(anchor.kind === 'point' ? anchor.time : anchor.start);
          }}
          onTime={(value) => {
            const next = playing ? reviewPlaybackTime(value, snapshot.document.edits) : value;
            if (next !== value && video.current) {
              video.current.currentTime = next;
              if (next >= source.duration) video.current.pause();
            }
            setTime(next);
            setSelection((current) =>
              current.kind === 'point' ? { kind: 'point', time: next } : current
            );
          }}
          onPlaying={setPlaying}
          onError={() => setMessage(translate('gallery.videoReview.playbackFailed'))}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {resource.telemetry ? (
            <>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={telemetry}
                  onChange={(event) => setTelemetry(event.target.checked)}
                />
                {translate('gallery.videoReview.telemetry')}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={cursor}
                  disabled={!telemetry}
                  onChange={(event) => setCursor(event.target.checked)}
                />
                {translate('gallery.videoReview.cursor')}
              </label>
            </>
          ) : (
            <p>{translate('gallery.videoReview.telemetryUnavailable')}</p>
          )}
          {projected.warnings ? <p>{translate('gallery.videoReview.telemetryWarning')}</p> : null}
        </div>
        <ReviewTimeline
          duration={source.duration}
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
