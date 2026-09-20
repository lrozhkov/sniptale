import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Volume2, VolumeX, Link2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { QuickEditOriginalAudio } from '../../features/video/review/advanced/types';
import { originalAudioGainAt } from '../../features/video/review/advanced/original-audio';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import type { ReviewTrackProjection } from './track-projection';
import type { useReviewAudio } from './use-review-audio';
import { ReviewAudioWaveform } from './audio-waveform';
import { ReviewTrackRow, ReviewTrackCuts } from './track-row';
import { ReviewButton, reviewTrackStatusButtonClassName } from './controls';

type Drag = { pointerId: number; from: number; to: number; id?: string; edge?: 'start' | 'end' };

/** Source-time automation shares video coordinates and never affects added audio clips. */
export function ReviewOriginalAudioTrack(props: {
  original: QuickEditOriginalAudio;
  waveform?: ReviewWaveform | undefined;
  projection?: ReviewTrackProjection | undefined;
  duration: number;
  busy: boolean;
  editor?: ReturnType<typeof useReviewAudio> | undefined;
  edits?: readonly ReviewEdit[] | undefined;
  onRange?: ((range: ReviewAnchor) => void) | undefined;
  onSelectSpeed?: ((edit: ReviewEdit) => void) | undefined;
  onOriginal(patch: Partial<QuickEditOriginalAudio>): void;
}) {
  const duration = props.projection?.duration ?? props.duration;
  const gesture = useOriginalAudioGesture(props, duration);
  const preview = gesture.preview;
  const gainAt = useCallback(
    (time: number) => originalAudioGainAt(props.original, time, props.edits),
    [props.original, props.edits]
  );
  const rectStyle = (start: number, end: number) => ({
    left: `${(start / duration) * 100}%`,
    width: `${((end - start) / duration) * 100}%`,
  });
  return (
    <ReviewTrackRow
      label={translate('gallery.videoReview.audioOriginal')}
      icon={<Volume2 size={14} aria-hidden="true" />}
      controls={
        <ReviewButton
          label={translate('gallery.videoReview.audioEnabled')}
          aria-pressed={!props.original.muted}
          disabled={props.busy}
          className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
          onClick={() => props.onOriginal({ muted: !props.original.muted })}
        >
          {props.original.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </ReviewButton>
      }
    >
      <div
        data-ui="gallery.videoReview.audioLane"
        data-original-audio-lane
        className="relative mt-1 h-8 rounded bg-[var(--sniptale-color-surface-hover)] touch-none"
        {...gesture.handlers}
      >
        <ReviewAudioWaveform
          waveform={props.waveform}
          duration={duration}
          volume={1}
          muted={props.original.muted}
          gainAt={gainAt}
        />
        {props.original.ranges?.map((range) => {
          const selected = props.editor?.selectedOriginal?.id === range.id;
          return (
            <button
              key={range.id}
              type="button"
              disabled={props.busy}
              aria-pressed={selected}
              aria-label={translate('gallery.videoReview.originalAudioRange')}
              title={`${translate('gallery.videoReview.originalAudioRange')}: ${Math.round(range.volume * 100)}%`}
              data-ui="gallery.videoReview.originalAudioRange"
              className={`absolute inset-y-0 z-10 flex items-center justify-center rounded border bg-transparent ${
                selected
                  ? 'border-[var(--sniptale-color-accent)] text-[var(--sniptale-color-accent)]'
                  : 'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]'
              }`}
              style={rectStyle(range.start, range.end)}
              onPointerDown={(event) => {
                if (!(event.target instanceof HTMLElement && event.target.dataset['audioEdge']))
                  event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                props.editor?.selectOriginal(range.id);
              }}
            >
              {range.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {(['start', 'end'] as const).map((edge) => (
                <span
                  key={edge}
                  data-audio-edge={edge}
                  data-audio-id={range.id}
                  className={`absolute inset-y-0 w-2 cursor-ew-resize border-[var(--sniptale-color-text-muted)] ${
                    edge === 'start' ? 'left-0 border-l-2' : 'right-0 border-r-2'
                  }`}
                />
              ))}
            </button>
          );
        })}
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
              className="absolute inset-y-0 z-20 flex items-center justify-center gap-1 rounded border border-dashed
                border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]/80
                text-[var(--sniptale-color-text-secondary)]"
              style={rectStyle(edit.start, edit.end)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                props.onSelectSpeed?.(edit);
              }}
            >
              <VolumeX size={14} />
              <Link2 size={12} />
            </button>
          ))}
        {preview ? (
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
    </ReviewTrackRow>
  );
}

/** One pointer transaction for range drawing/resize, with Escape and capture-loss cancellation. */
function useOriginalAudioGesture(
  props: Parameters<typeof ReviewOriginalAudioTrack>[0],
  duration: number
) {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Drag | null>(null);
  useEffect(() => {
    if (!preview) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        drag.current = null;
        setPreview(null);
      }
    };
    document.addEventListener('keydown', cancel, true);
    return () => document.removeEventListener('keydown', cancel, true);
  }, [preview]);
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(duration, ((event.clientX - rect.left) / Math.max(1, rect.width)) * duration)
    );
  };
  return {
    preview,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (props.busy || event.button !== 0 || !props.editor) return;
        const target = event.target;
        const handle =
          target instanceof Element ? target.closest<HTMLElement>('[data-audio-edge]') : null;
        if (!handle && target instanceof Element && target.closest('button')) return;
        event.stopPropagation();
        event.preventDefault();
        const at = position(event);
        const id = handle?.dataset['audioId'];
        const edge = handle?.dataset['audioEdge'];
        const range = props.original.ranges?.find((item) => item.id === id);
        drag.current = {
          pointerId: event.pointerId,
          from: range?.start ?? at,
          to: range?.end ?? at,
          ...(id && (edge === 'start' || edge === 'end') ? { id, edge } : {}),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview(drag.current);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (!drag.current || event.pointerId !== drag.current.pointerId) return;
        const at = position(event);
        drag.current = {
          ...drag.current,
          ...(drag.current.edge === 'start' ? { from: at } : { to: at }),
        };
        setPreview(drag.current);
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointerId) return;
        drag.current = null;
        setPreview(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
        event.stopPropagation();
        if (props.busy) return;
        if (current.id)
          props.editor?.patchOriginal(current.id, { start: current.from, end: current.to });
        else {
          const range: ReviewAnchor = {
            kind: 'range',
            start: Math.min(current.from, current.to),
            end: Math.max(current.from, current.to),
          };
          if (range.end - range.start < 0.01) return;
          props.onRange?.(range);
          if (props.editor?.originalTool) props.editor.addOriginal(range);
        }
      },
      onPointerCancel: () => {
        drag.current = null;
        setPreview(null);
      },
      onLostPointerCapture: () => {
        drag.current = null;
        setPreview(null);
      },
    },
  };
}
