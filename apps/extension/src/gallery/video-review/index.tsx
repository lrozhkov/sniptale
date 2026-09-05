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

function useReviewKeys({
  time,
  seek,
  play,
  cancelDrawing,
}: {
  time: number;
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
        seek(time + (event.key === 'ArrowLeft' ? -1 : 1));
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
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<ReviewAnchor>(
    composer.annotation?.anchor ?? { kind: 'point', time: 0 }
  );
  const [selected, setSelected] = useState<ReviewAnnotation | null>(null);
  const [hovered, setHovered] = useState<ReviewAnnotation | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [telemetry, setTelemetry] = useState(!!resource.telemetry);
  const [cursor, setCursor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const projected = useMemo(
    () =>
      resource.telemetry
        ? projectReviewTelemetry(resource.telemetry, source.duration, cursor)
        : { markers: [], warnings: 0 },
    [resource.telemetry, source.duration, cursor]
  );
  const seek = (value: number) => {
    const next = Math.max(0, Math.min(source.duration, value));
    if (video.current) video.current.currentTime = next;
    setTime(next);
    if (selection.kind === 'point') setSelection({ kind: 'point', time: next });
  };
  const play = () => {
    if (!video.current) return;
    setDrawing(false);
    if (video.current.paused)
      void video.current
        .play()
        .catch(() => setMessage(translate('gallery.videoReview.playbackFailed')));
    else video.current.pause();
  };
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
  const canStart = () => {
    if (!composer.annotation) return true;
    setMessage(translate('gallery.videoReview.finishComment'));
    return false;
  };
  const selectComment = (annotation: ReviewAnnotation) => {
    video.current?.pause();
    setDrawing(false);
    setSelected(annotation);
    seek(annotation.anchor.kind === 'point' ? annotation.anchor.time : annotation.anchor.start);
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
      seek(marker.start);
      setSelection(anchor);
    }
  };
  useReviewKeys({ time, seek, play, cancelDrawing: () => setDrawing(false) });
  const errorKey: Parameters<typeof translate>[0] =
    snapshot.error === 'conflict'
      ? 'gallery.videoReview.conflict'
      : snapshot.error === 'changed-source'
        ? 'gallery.videoReview.sourceChanged'
        : snapshot.error === 'missing-media'
          ? 'gallery.videoReview.missingMedia'
          : 'gallery.videoReview.saveFailed';
  const regionAnnotation =
    composer.annotation ??
    hovered ??
    (selected ? snapshot.document.annotations.find((item) => item.id === selected.id) : null);
  const displayRegion =
    regionAnnotation?.anchor.kind === 'point' &&
    Math.abs(regionAnnotation.anchor.time - time) < 0.05
      ? regionAnnotation.region
      : undefined;
  return {
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
    busy,
    setBusy,
    message,
    setMessage,
    projected,
    seek,
    play,
    run,
    canStart,
    selectComment,
    add,
    errorKey,
    displayRegion,
  };
}

type InspectorState = Pick<
  ReturnType<typeof useReviewEditorState>,
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
  | 'errorKey'
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
    session,
    snapshot,
    composer,
    video,
    time,
    selected,
    setHovered,
    drawing,
    setDrawing,
    busy,
    setBusy,
    message,
    setMessage,
    seek,
    run,
    canStart,
    selectComment,
    add,
    errorKey,
  } = state;
  return (
    <ReviewInspector
      filename={resource.filename}
      annotations={snapshot.document.annotations}
      selectedId={selected?.id ?? null}
      busy={busy}
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
        void exportReviewReport(resource, action)
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
        <ReviewComposer
          key={composer.annotation.id}
          annotation={composer.annotation}
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
            seek(
              composer.annotation!.anchor.kind === 'point' ? composer.annotation!.anchor.time : time
            );
            setDrawing(!drawing);
          }}
        />
      ) : null}
    </ReviewInspector>
  );
}

function ReviewEditor({ resource, onBack }: { resource: LoadedReview; onBack(): void }) {
  const state = useReviewEditorState(resource);
  const {
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
            setTime(value);
            setSelection((current) =>
              current.kind === 'point' ? { kind: 'point', time: value } : current
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
          selection={selection}
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
