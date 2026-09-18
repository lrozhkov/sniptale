import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Mic, Plus, Volume2, VolumeX } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type {
  QuickEditAudioClip,
  QuickEditAudioState,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import {
  clampQuickEditAudioClip,
  trimQuickEditAudioClip,
} from '../../features/video/review/advanced/audio';
import { ReviewButton } from './controls';
import type { ReviewAudioLane } from './use-review-audio';

const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

interface AudioDragState {
  lane: ReviewAudioLane;
  id: string;
  edge: 'start' | 'end' | 'move';
  x: number;
  width: number;
  moved: boolean;
  pointerId: number;
  node: HTMLDivElement;
}

const LANES: Array<{
  key: ReviewAudioLane;
  label: 'gallery.videoReview.audioVoiceover' | 'gallery.videoReview.audioMusic';
}> = [
  { key: 'voiceover', label: 'gallery.videoReview.audioVoiceover' },
  { key: 'music', label: 'gallery.videoReview.audioMusic' },
];

/** One semantic clip lane: move drags the block, the edges trim inside the timeline. */
function ReviewAudioClipLane(props: {
  lane: ReviewAudioLane;
  label: string;
  clips: readonly QuickEditAudioClip[];
  duration: number;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onMoveClip(lane: ReviewAudioLane, id: string, timelineStart: number): void;
  onTrimClip(lane: ReviewAudioLane, id: string, edge: 'start' | 'end', timelineTime: number): void;
  trailing?: ReactNode;
}) {
  const [preview, setPreview] = useState<{
    id: string;
    timelineStart: number;
    duration: number;
  } | null>(null);
  const drag = useRef<AudioDragState | null>(null);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      setPreview(null);
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, []);
  const commit = () => {
    const current = drag.current;
    const shown = preview;
    drag.current = null;
    setPreview(null);
    if (!current || !shown || !current.moved) return;
    if (current.edge === 'start')
      props.onTrimClip(current.lane, current.id, 'start', shown.timelineStart);
    else if (current.edge === 'end')
      props.onTrimClip(current.lane, current.id, 'end', shown.timelineStart + shown.duration);
    else props.onMoveClip(current.lane, current.id, shown.timelineStart);
  };
  return (
    <div
      data-ui="gallery.videoReview.audioLane"
      className="relative mt-1 h-8 rounded bg-[var(--sniptale-color-surface-hover)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center gap-2 px-3
            text-[11px] text-[var(--sniptale-color-text-muted)]"
      >
        {props.label}
      </div>
      {props.clips.map((clip) => {
        const shown =
          preview?.id === clip.id
            ? preview
            : { timelineStart: clip.timelineStart, duration: clip.duration };
        return (
          <ReviewAudioClipBlock
            key={clip.id}
            clip={clip}
            shown={shown}
            selected={props.selectedId === clip.id}
            busy={props.busy}
            label={props.label}
            duration={props.duration}
            drag={drag}
            lane={props.lane}
            clips={props.clips}
            onSelect={props.onSelect}
            onPreview={(value) => setPreview(value && { id: clip.id, ...value })}
            onCommit={commit}
          />
        );
      })}
      {!props.clips.length ? (
        <p
          className="pointer-events-none absolute inset-0 flex items-center justify-center
              text-[11px] text-[var(--sniptale-color-text-muted)]"
        >
          {translate('gallery.videoReview.audioEmpty')}
        </p>
      ) : null}
      {props.trailing}
    </div>
  );
}

/** One draggable clip block; edges trim, the body moves, and Escape cancels the preview. */
function ReviewAudioClipBlock(props: {
  clip: QuickEditAudioClip;
  shown: { timelineStart: number; duration: number };
  selected: boolean;
  busy: boolean;
  label: string;
  duration: number;
  drag: MutableRefObject<AudioDragState | null>;
  lane: ReviewAudioLane;
  clips: readonly QuickEditAudioClip[];
  onSelect(id: string): void;
  onPreview(value: { timelineStart: number; duration: number } | null): void;
  onCommit(): void;
}) {
  const clip = props.clip;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${props.label} ${reviewClipLabel(clip)}`}
      aria-pressed={props.selected}
      className={`absolute inset-y-0 z-[5] cursor-grab overflow-hidden rounded border
          text-xs active:cursor-grabbing ${
            props.selected
              ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent-soft)]'
              : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]'
          }`}
      style={{
        left: percent(props.shown.timelineStart, props.duration),
        width: percent(props.shown.duration, props.duration),
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || props.busy) return;
        event.stopPropagation();
        props.onSelect(clip.id);
        const edge =
          event.target instanceof Element
            ? event.target.closest('[data-audio-edge]')?.getAttribute('data-audio-edge')
            : null;
        props.drag.current = {
          lane: props.lane,
          id: clip.id,
          edge: edge === 'start' || edge === 'end' ? edge : 'move',
          x: event.clientX,
          width: event.currentTarget.parentElement!.getBoundingClientRect().width,
          moved: false,
          pointerId: event.pointerId,
          node: event.currentTarget,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = props.drag.current;
        if (!current || current.width <= 0) return;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        const delta = ((event.clientX - current.x) / current.width) * props.duration;
        const base = props.clips.find((item) => item.id === current.id);
        if (!base) return;
        const next =
          current.edge === 'start'
            ? trimQuickEditAudioClip(base, 'start', base.timelineStart + delta, props.duration)
            : current.edge === 'end'
              ? trimQuickEditAudioClip(
                  base,
                  'end',
                  base.timelineStart + base.duration + delta,
                  props.duration
                )
              : clampQuickEditAudioClip(
                  { ...base, timelineStart: base.timelineStart + delta },
                  props.duration
                );
        props.onPreview({ timelineStart: next.timelineStart, duration: next.duration });
      }}
      onPointerUp={props.onCommit}
      onPointerCancel={props.onCommit}
    >
      <span
        data-audio-edge="start"
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
      />
      <span
        data-audio-edge="end"
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
      />
      <span className="pointer-events-none block truncate px-3 text-[11px]">
        {reviewClipLabel(clip)}
      </span>
    </div>
  );
}

function reviewClipLabel(clip: QuickEditAudioClip) {
  return `${clip.timelineStart.toFixed(1)} +${clip.duration.toFixed(1)}`;
}

/** The three semantic audio lanes; the original stays bound to the video structure. */
export function ReviewAudioTrack(props: {
  audio: QuickEditAudioState;
  duration: number;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string | null): void;
  onMoveClip(lane: ReviewAudioLane, id: string, timelineStart: number): void;
  onTrimClip(lane: ReviewAudioLane, id: string, edge: 'start' | 'end', timelineTime: number): void;
  onOriginal(patch: Partial<QuickEditOriginalAudio>): void;
  onImportFile(file: File): void;
  onRecordVoiceover(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div data-ui="gallery.videoReview.audioTrack" className="space-y-1">
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) props.onImportFile(file);
        }}
      />
      <div
        data-ui="gallery.videoReview.audioLane"
        className="relative mt-1 flex h-8 items-center gap-2 rounded bg-[var(--sniptale-color-surface-hover)] px-3"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded opacity-40"
          style={{
            background:
              'repeating-linear-gradient(90deg, transparent 0 3px, var(--sniptale-color-border-soft) 3px 4px)',
          }}
        />
        <span className="relative z-10 text-[11px] text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.audioOriginal')}
        </span>
        <ReviewButton
          label={translate('gallery.videoReview.audioClipMute')}
          aria-pressed={props.audio.original.muted}
          disabled={props.busy}
          className="relative z-10 !h-6 !min-h-6 !px-1.5"
          onClick={() => props.onOriginal({ muted: !props.audio.original.muted })}
        >
          {props.audio.original.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </ReviewButton>
      </div>
      {LANES.map((lane) => (
        <ReviewAudioClipLane
          key={lane.key}
          lane={lane.key}
          label={translate(lane.label)}
          clips={props.audio[lane.key]}
          duration={props.duration}
          selectedId={props.selectedId}
          busy={props.busy}
          onSelect={props.onSelect}
          onMoveClip={props.onMoveClip}
          onTrimClip={props.onTrimClip}
          {...(lane.key === 'music'
            ? {
                trailing: (
                  <ReviewButton
                    label={translate('gallery.videoReview.audioImport')}
                    disabled={props.busy}
                    className="!absolute right-1 top-1/2 z-10 !h-6 !min-h-6 -translate-y-1/2 !px-1.5"
                    onClick={() => input.current?.click()}
                  >
                    <Plus size={14} />
                  </ReviewButton>
                ),
              }
            : lane.key === 'voiceover'
              ? {
                  trailing: (
                    <ReviewButton
                      label={translate('gallery.videoReview.recordVoiceover')}
                      disabled={props.busy}
                      className="!absolute right-1 top-1/2 z-10 !h-6 !min-h-6 -translate-y-1/2 !px-1.5"
                      onClick={props.onRecordVoiceover}
                    >
                      <Mic size={14} />
                    </ReviewButton>
                  ),
                }
              : {})}
        />
      ))}
    </div>
  );
}
