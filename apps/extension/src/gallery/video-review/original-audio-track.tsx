import { reviewTimelineHint } from './timeline-hints';
import { useReviewTimelineSnap, type ReviewTimelineSnap } from './timeline-magnets';
import { ReviewTrackVisibilityButton } from './track-row';
import { SNAP_THRESHOLD_PX, snapTimelineTime } from '../../features/video/review/snap';
import { reviewTrackMetrics, ReviewTrackRow, ReviewTrackCuts } from './track-row';
import { useReviewGestureCancellation } from './timeline-drag';
import { useReviewResizeBoundary } from './timeline-resize-guide';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import {
  memo,
  useLayoutEffect,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { Volume2, VolumeX, Link2 } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type {
  QuickEditOriginalAudio,
  QuickEditOriginalAudioRange,
} from '../../features/video/review/advanced/types';
import { originalAudioGainAt } from '../../features/video/review/advanced/original-audio';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import { reviewAudioClipRows, type ReviewTrackProjection } from './track-projection';
import type { useReviewAudio } from './use-review-audio';
import { ReviewAudioWaveform } from './audio-waveform';
import { reviewTrackStatusButtonClassName } from './controls';

type Drag = {
  admission: ReturnType<typeof deferReviewGesture>;
  pointerId: number;
  node: HTMLDivElement;
  from: number;
  to: number;
  at: number;
  x: number;
  moved: boolean;
  start: number;
  end: number;
  min: number;
  max: number;
  id?: string;
  edge?: 'start' | 'end' | 'move';
};

/** Source-time automation shares video coordinates and never affects added audio clips. */
type ReviewOriginalAudioTrackProps = {
  compact?: boolean | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  original: QuickEditOriginalAudio;
  waveform?: ReviewWaveform | undefined;
  projection?: ReviewTrackProjection | undefined;
  duration: number;
  busy: boolean;
  editor?: ReturnType<typeof useReviewAudio> | undefined;
  edits?: readonly ReviewEdit[] | undefined;
  selectedEditId?: string | undefined;
  onRange?: ((range: ReviewAnchor) => void) | undefined;
  onSelectSpeed?: ((edit: ReviewEdit) => void) | undefined;
  onOriginal(patch: Partial<QuickEditOriginalAudio>): void;
};

type OriginalAudioEditor = Pick<
  ReturnType<typeof useReviewAudio>,
  | 'originalRanges'
  | 'originalPlayback'
  | 'originalTool'
  | 'selectOriginal'
  | 'patchOriginal'
  | 'addOriginal'
> & {
  selectedOriginalId: string | undefined;
};
type OriginalAudioPresentationProps = Omit<ReviewOriginalAudioTrackProps, 'editor'> & {
  editor?: OriginalAudioEditor | undefined;
};

/** Publish a narrow command receiver only after React commits the live adapter. */
export function ReviewOriginalAudioTrack(props: ReviewOriginalAudioTrackProps) {
  const receivers = {
    beforeAction: props.beforeAction,
    onOriginal: props.onOriginal,
    onRange: props.onRange,
    onSelectSpeed: props.onSelectSpeed,
    selectOriginal: props.editor?.selectOriginal,
    patchOriginal: props.editor?.patchOriginal,
    addOriginal: props.editor?.addOriginal,
  };
  const committed = useRef(receivers);
  useLayoutEffect(() => {
    committed.current = receivers;
  });
  const commands = useMemo(
    () => ({
      beforeAction: ((action) => {
        const before = committed.current.beforeAction;
        if (before) before(action);
        else action();
      }) satisfies ReviewBeforeAction,
      onOriginal: (patch: Partial<QuickEditOriginalAudio>) => committed.current.onOriginal(patch),
      onRange: (range: ReviewAnchor) => committed.current.onRange?.(range),
      onSelectSpeed: (edit: ReviewEdit) => committed.current.onSelectSpeed?.(edit),
      selectOriginal: (...args: Parameters<OriginalAudioEditor['selectOriginal']>) =>
        committed.current.selectOriginal?.(...args),
      patchOriginal: (...args: Parameters<OriginalAudioEditor['patchOriginal']>) =>
        committed.current.patchOriginal?.(...args),
      addOriginal: (...args: Parameters<OriginalAudioEditor['addOriginal']>) =>
        committed.current.addOriginal?.(...args) ?? false,
    }),
    []
  );
  const ranges = props.editor?.originalRanges;
  const playback = props.editor?.originalPlayback;
  const tool = props.editor?.originalTool;
  const selectedOriginalId = props.editor?.selectedOriginal?.id;
  const hasEditor = !!props.editor;
  const editor = useMemo(
    () =>
      hasEditor && ranges && playback && tool !== undefined
        ? {
            originalRanges: ranges,
            originalPlayback: playback,
            originalTool: tool,
            selectedOriginalId,
            selectOriginal: commands.selectOriginal,
            patchOriginal: commands.patchOriginal,
            addOriginal: commands.addOriginal,
          }
        : undefined,
    [hasEditor, ranges, playback, tool, selectedOriginalId, commands]
  );
  return (
    <ReviewOriginalAudioPresentation
      compact={props.compact}
      original={props.original}
      waveform={props.waveform}
      projection={props.projection}
      duration={props.duration}
      busy={props.busy}
      edits={props.edits}
      selectedEditId={props.selectedEditId}
      editor={editor}
      beforeAction={commands.beforeAction}
      onOriginal={commands.onOriginal}
      onRange={commands.onRange}
      onSelectSpeed={commands.onSelectSpeed}
    />
  );
}

const ReviewOriginalAudioPresentation = memo(function ReviewOriginalAudioPresentation(
  props: OriginalAudioPresentationProps
) {
  useAppLocale();
  const duration = props.projection?.duration ?? props.duration;
  const muted = props.original.muted || props.original.volume === 0;
  const gesture = useOriginalAudioGesture(props, duration);
  const preview = gesture.preview;
  const { ranges, rows } = useMemo(() => {
    const ranges = props.editor?.originalRanges ?? props.original.ranges ?? [];
    return { ranges, rows: reviewAudioClipRows(ranges) };
  }, [props.editor?.originalRanges, props.original.ranges]);
  const rowCount = Math.max(1, ...[...rows.values()].map((row) => row + 1));
  const playback = props.editor?.originalPlayback ?? props.original;
  const gainAt = useCallback(
    (time: number) => originalAudioGainAt(playback, time, props.edits),
    [playback, props.edits]
  );
  const rectStyle = (start: number, end: number) => {
    const left = props.projection?.focus.position(start) ?? start / duration;
    const right = props.projection?.focus.position(end, 'end') ?? end / duration;
    return { left: `${left * 100}%`, width: `${(right - left) * 100}%` };
  };
  return (
    <ReviewTrackRow
      track="originalAudio"
      muted={muted}
      label={translate('gallery.videoReview.audioOriginal')}
      icon={muted ? VolumeX : Volume2}
      controls={
        <OriginalAudioControls
          original={props.original}
          busy={props.busy}
          beforeAction={props.beforeAction}
          onOriginal={props.onOriginal}
        />
      }
    >
      <div className="min-w-0">
        <div
          data-ui="gallery.videoReview.audioLane"
          data-original-audio-lane
          data-audio-muted={muted ? 'true' : 'false'}
          className={`relative h-8 rounded touch-none border-b border-dashed
            bg-[var(--sniptale-color-surface-hover)]
            ${muted ? 'border-[var(--sniptale-color-text-secondary)]' : 'border-transparent'}`}
          style={{
            height: rowCount * reviewTrackMetrics(props.compact).step,
            ...(gesture.preview?.id
              ? { cursor: gesture.preview.edge === 'move' ? 'grabbing' : 'ew-resize' }
              : {}),
          }}
          data-dragging={gesture.preview?.id ? 'true' : undefined}
          {...gesture.handlers}
        >
          <ReviewAudioWaveform
            waveform={props.waveform}
            duration={duration}
            volume={1}
            muted={muted}
            gainAt={gainAt}
          />
          {ranges.map((range) => (
            <ReviewOriginalGainBlock
              compact={props.compact}
              key={range.id}
              range={range}
              projection={props.projection}
              row={rows.get(range.id) ?? 0}
              duration={duration}
              preview={preview}
              selected={props.editor?.selectedOriginalId === range.id}
              busy={props.busy}
              onSelect={() =>
                (props.beforeAction ?? ((action) => action()))(() =>
                  props.editor?.selectOriginal(range.id)
                )
              }
            />
          ))}
          {props.edits
            ?.filter((edit) => edit.kind === 'speed' && edit.audio === 'mute')
            .map((edit) => (
              <button
                key={edit.id}
                type="button"
                disabled={props.busy}
                title={translate('gallery.videoReview.audioMutedBySpeed')}
                aria-label={translate('gallery.videoReview.audioMutedBySpeed')}
                data-ui="gallery.videoReview.speedAudioMute"
                aria-pressed={props.selectedEditId === edit.id}
                className={`absolute inset-y-0 z-20 flex items-center justify-center gap-1 rounded border text-[10px]
                ${reviewTimelineItemTone(props.selectedEditId === edit.id)}`}
                style={rectStyle(edit.start, edit.end)}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  (props.beforeAction ?? ((action) => action()))(() => props.onSelectSpeed?.(edit));
                }}
              >
                <ReviewTimelineLabel
                  icon={
                    <>
                      <VolumeX size={14} />
                      <Link2 size={12} />
                    </>
                  }
                  name={translate('gallery.videoReview.audioMutedBySpeed')}
                />
              </button>
            ))}
          {preview && !preview.id ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-30 border border-[var(--sniptale-color-accent)]"
              style={rectStyle(
                Math.min(preview.from, preview.to),
                Math.max(preview.from, preview.to)
              )}
            />
          ) : null}
          <ReviewTrackCuts projection={props.projection} />
        </div>
      </div>
    </ReviewTrackRow>
  );
});

/** Master gain and mute share the source track's existing mutation admission. */
function OriginalAudioControls(props: {
  original: QuickEditOriginalAudio;
  busy: boolean;
  beforeAction?: ReviewBeforeAction | undefined;
  onOriginal(patch: Partial<QuickEditOriginalAudio>): void;
}) {
  const muted = props.original.muted || props.original.volume === 0;
  return (
    <>
      <ReviewTrackVisibilityButton
        track="originalAudio"
        label={translate(
          muted ? 'gallery.videoReview.restoreSourceAudio' : 'gallery.videoReview.muteSourceAudio'
        )}
        enabled={!muted}
        disabled={props.busy}
        className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
        onToggle={() =>
          (props.beforeAction ?? ((action) => action()))(() => props.onOriginal({ muted: !muted }))
        }
        icon={muted ? VolumeX : Volume2}
      />
    </>
  );
}

/** One authored source-gain item keeps its selection and resize handles together. */
function ReviewOriginalGainBlock(props: {
  compact?: boolean | undefined;
  range: QuickEditOriginalAudioRange;
  projection?: ReviewTrackProjection | undefined;
  row: number;
  duration: number;
  preview: Drag | null;
  selected: boolean;
  busy: boolean;
  onSelect(): void;
}) {
  const { range, preview } = props;
  const start = preview?.id === range.id ? preview.from : range.start;
  const end = preview?.id === range.id ? preview.to : range.end;
  const left = props.projection?.focus.position(start) ?? start / props.duration;
  const right = props.projection?.focus.position(end, 'end') ?? end / props.duration;
  return (
    <button
      type="button"
      disabled={props.busy}
      aria-pressed={props.selected}
      aria-label={translate('gallery.videoReview.originalAudioRange')}
      title={`${translate('gallery.videoReview.originalAudioRange')}: ${Math.round(range.volume * 100)}%`}
      data-review-hint={reviewTimelineHint(
        translate('gallery.videoReview.originalAudioRange'),
        start,
        end,
        `${Math.round(range.volume * 100)}%`
      )}
      data-ui="gallery.videoReview.originalAudioRange"
      data-audio-id={range.id}
      data-review-removal-key={`original-audio:${range.id}`}
      data-review-snap-start={start}
      data-review-snap-end={end}
      className={`absolute z-10 flex cursor-grab items-center justify-center disabled:cursor-not-allowed
        rounded border ${reviewTimelineItemTone(props.selected, range.volume === 0 ? 'cut' : 'neutral')}`}
      style={{
        top:
          props.row * reviewTrackMetrics(props.compact).step +
          reviewTrackMetrics(props.compact).inset,
        height: reviewTrackMetrics(props.compact).body,
        left: `${left * 100}%`,
        width: `${(right - left) * 100}%`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      <span className="pointer-events-none mx-3 min-w-0 flex-1 text-[10px]">
        <ReviewTimelineLabel
          icon={range.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          value={range.volume > 0 ? `${Math.round(range.volume * 100)}%` : undefined}
        />
      </span>
      {(['start', 'end'] as const).map((edge) => (
        <span
          key={edge}
          data-audio-edge={edge}
          data-audio-id={range.id}
          className={`${reviewTimelineResizeHandleClassName} ${edge === 'start' ? 'left-0' : 'right-0'}`}
        ></span>
      ))}
    </button>
  );
}

/** Resolve optional edge magnets on the same source axis as the audio lane. */
function originalAudioPointerTime(
  event: PointerEvent<HTMLDivElement>,
  duration: number,
  props: OriginalAudioPresentationProps,
  drag: Drag | null,
  snap: ReviewTimelineSnap = snapTimelineTime
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const displayTime =
    ((event.clientX - rect.left) / Math.max(1, rect.width)) *
    (props.projection?.display.duration ?? duration);
  const time = Math.max(
    0,
    Math.min(duration, props.projection?.display.displayToSource(displayTime) ?? displayTime)
  );
  if (event.altKey || drag?.edge === 'move') return time;
  const candidates = [
    0,
    duration,
    ...(props.edits ?? []).flatMap((edit) => [edit.start, edit.end]),
    ...(props.editor?.originalRanges ?? props.original.ranges ?? [])
      .filter((range) => range.id !== drag?.id)
      .flatMap((range) => [range.start, range.end]),
  ];
  return snap(time, candidates, (SNAP_THRESHOLD_PX * duration) / Math.max(1, rect.width)).time;
}

/** One pointer transaction for range drawing/resize, with Escape and capture-loss cancellation. */
function useOriginalAudioGesture(props: OriginalAudioPresentationProps, duration: number) {
  const snap = useReviewTimelineSnap();
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Drag | null>(null);
  const boundary = preview;
  useReviewResizeBoundary(
    boundary?.admission ?? null,
    boundary?.edge &&
      boundary.edge !== 'move' &&
      (props.editor?.originalRanges ?? props.original.ranges ?? []).some(
        (range) => range.id === boundary.id
      )
      ? boundary.edge === 'start'
        ? boundary.from
        : boundary.to
      : null,
    boundary,
    boundary ? { start: boundary.from, end: boundary.to } : null
  );
  const lifetime = useOriginalAudioGestureLifetime({
    drag,
    drawing: !!props.editor?.originalTool,
    resetPreview: () => setPreview(null),
  });
  return {
    preview,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (props.busy || event.button !== 0 || !props.editor) return;
        const target = event.target;
        const item =
          target instanceof Element ? target.closest<HTMLElement>('[data-audio-id]') : null;
        if (!item && !props.editor.originalTool) return;
        event.stopPropagation();
        event.preventDefault();
        const at = originalAudioPointerTime(event, duration, props, drag.current, snap);
        const id = item?.dataset['audioId'];
        const edge = item?.dataset['audioEdge'];
        const range =
          props.editor.originalRanges?.find((item) => item.id === id) ??
          props.original.ranges?.find((item) => item.id === id);
        const overlay = range && 'origin' in range && range.origin !== 'manual';
        const neighbors = overlay
          ? []
          : (props.original.ranges?.filter((other) => other.id !== id) ?? []);
        const admission = deferReviewGesture(
          props.beforeAction,
          () => {
            if (id && lifetime.canCommit('item')) props.editor?.selectOriginal(id);
          },
          'click'
        );
        drag.current = {
          admission,
          node: event.currentTarget,
          x: event.clientX,
          moved: false,
          at,
          start: range?.start ?? at,
          end: range?.end ?? at,
          min: Math.max(
            0,
            ...neighbors
              .filter((other) => other.end <= (range?.start ?? at))
              .map((other) => other.end)
          ),
          max: Math.min(
            duration,
            ...neighbors
              .filter((other) => other.start >= (range?.end ?? at))
              .map((other) => other.start)
          ),
          pointerId: event.pointerId,
          from: range?.start ?? at,
          to: range?.end ?? at,
          ...(id ? { id, edge: edge === 'start' || edge === 'end' ? edge : 'move' } : {}),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview(drag.current);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (!drag.current || event.pointerId !== drag.current.pointerId) return;
        const at = originalAudioPointerTime(event, duration, props, drag.current, snap);
        const current = drag.current;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        if (!current.moved) return;
        const length = current.end - current.start;
        if (current.edge === 'move') {
          const free = current.start + at - current.at;
          const threshold = event.altKey
            ? 0
            : (SNAP_THRESHOLD_PX * duration) /
              Math.max(1, event.currentTarget.getBoundingClientRect().width);
          const start = snap(free, [], threshold),
            end = snap(free + length, [], threshold);
          const a = start.candidate === null ? Infinity : Math.abs(start.time - free);
          const b = end.candidate === null ? Infinity : Math.abs(end.time - free - length);
          const moved = a <= b ? start.time : end.time - length;
          const from = Math.max(current.min, Math.min(current.max - length, moved));
          drag.current = { ...current, from, to: from + length };
        } else if (current.edge === 'start') {
          drag.current = {
            ...current,
            from: Math.max(current.min, Math.min(current.end - 0.001, at)),
          };
        } else if (current.edge === 'end') {
          drag.current = {
            ...current,
            to: Math.max(current.start + 0.001, Math.min(current.max, at)),
          };
        } else drag.current = { ...current, to: at };
        setPreview(drag.current);
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointerId) return;
        drag.current = null;
        setPreview(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
        event.stopPropagation();
        if (current.id && !current.moved) {
          if (current.edge === 'move') current.admission.select();
          else current.admission.cancel();
          return;
        }
        current.admission.commit(() => {
          if (!lifetime.canCommit(current.id ? 'item' : 'range')) return;
          if (current.id)
            props.editor?.patchOriginal(current.id, { start: current.from, end: current.to });
          else {
            const range: ReviewAnchor = {
              kind: 'range',
              start: Math.min(current.from, current.to),
              end: Math.max(current.from, current.to),
            };
            if (range.end - range.start < 0.01) {
              props.editor?.addOriginal(range);
              return;
            }
            props.onRange?.(range);
            if (props.editor?.originalTool) props.editor.addOriginal(range);
          }
        });
      },
      onPointerCancel: () => {
        drag.current?.admission.cancel();
        drag.current = null;
        setPreview(null);
      },
      onLostPointerCapture: () => {
        drag.current?.admission.cancel();
        drag.current = null;
        setPreview(null);
      },
    },
  };
}

/** Local capture admission and cleanup follow current tool availability, never stale closures. */
function useOriginalAudioGestureLifetime(props: {
  drag: React.RefObject<Drag | null>;
  drawing: boolean;
  resetPreview(): void;
}) {
  const { drag, drawing, resetPreview } = props;
  const mounted = useRef(true);
  const available = useRef(props.drawing);
  useLayoutEffect(() => {
    available.current = drawing;
  }, [drawing]);
  const canCommit = useCallback(
    (kind: 'item' | 'range') => mounted.current && (kind === 'item' || available.current),
    []
  );
  const discard = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    current.admission.cancel();
    if (current.node.hasPointerCapture?.(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
  }, [drag]);
  useReviewGestureCancellation(() => {
    discard();
    resetPreview();
  });
  useEffect(() => {
    const current = drag.current;
    if (!current || canCommit(current.id ? 'item' : 'range')) return;
    discard();
    resetPreview();
  }, [drag, drawing, canCommit, discard, resetPreview]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard();
    };
  }, [discard]);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || !drag.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      discard();
      resetPreview();
    };
    document.addEventListener('keydown', onEscape, true);
    return () => document.removeEventListener('keydown', onEscape, true);
  });
  return { canCommit };
}
