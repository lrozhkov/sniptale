import { ReviewOriginalAudioTrack } from './original-audio-track';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { useReviewAudio } from './use-review-audio';
import {
  isReviewVoiceoverCut,
  reviewVoiceoverRange,
  reviewVoiceoverOffset,
} from '../../features/video/review/voiceover-edits';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { Mic, Plus, Volume2, VolumeX, AudioLines } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type {
  QuickEditAudioClip,
  QuickEditAudioState,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import {
  moveQuickEditAudioClip,
  trimQuickEditAudioClip,
} from '../../features/video/review/advanced/audio';
import {
  reviewTrackStatusButtonClassName,
  reviewIconButtonClassName,
  ReviewButton,
} from './controls';
import type { ReviewTrackProjection } from './track-projection';
import { ReviewTrackRow, ReviewTrackCuts } from './track-row';
import { ReviewAudioWaveform } from './audio-waveform';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import { SNAP_THRESHOLD_PX, snapTimelineTime } from '../../features/video/review/snap';
import type { ReviewAudioLane, ReviewAudioAsset } from './use-review-audio';

const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

/** A drag carries files when the payload list or the Files type is present. */
function dragHasFiles(event: DragEvent<HTMLElement>) {
  return (
    event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes('Files')
  );
}

interface AudioDragState {
  lane: ReviewAudioLane;
  id: string;
  edge: 'start' | 'end' | 'move';
  x: number;
  sourceAtPointer: number;
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
  projection?: ReviewTrackProjection | undefined;
  snapTimes?: readonly number[] | undefined;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  assets?: ReadonlyMap<string, ReviewAudioAsset> | undefined;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onMoveClip(lane: ReviewAudioLane, id: string, timelineStart: number): void;
  onTrimClip(
    lane: ReviewAudioLane,
    id: string,
    edge: 'start' | 'end',
    timelineTime: number,
    assetDuration?: number
  ): void;
  onDropFile?: (file: File, timelineTime: number) => void;
  trailing?: ReactNode;
  cutsProjection?: ReviewTrackProjection | undefined;
}) {
  const [preview, setPreview] = useState<{
    id: string;
    timelineStart: number;
    duration: number;
    guide: number | null;
  } | null>(null);
  const dropTarget = useAudioLaneDrop(props);
  const drag = useRef<AudioDragState | null>(null);
  const cancelDrag = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    setPreview(null);
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
  }, []);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelDrag();
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [cancelDrag]);
  const commit = () => {
    const current = drag.current;
    const shown = preview;
    drag.current = null;
    setPreview(null);
    if (!current || !shown || !current.moved) return;
    const assetId = props.clips.find((clip) => clip.id === current.id)?.assetId ?? '';
    const assetDuration =
      props.assets?.get(assetId)?.duration ?? props.waveforms?.get(assetId)?.duration;
    if (current.edge === 'start')
      props.onTrimClip(current.lane, current.id, 'start', shown.timelineStart, assetDuration);
    else if (current.edge === 'end')
      props.onTrimClip(
        current.lane,
        current.id,
        'end',
        shown.timelineStart + shown.duration,
        assetDuration
      );
    else props.onMoveClip(current.lane, current.id, shown.timelineStart);
  };
  return (
    <ReviewTrackRow
      label={props.label}
      icon={<AudioLines size={14} aria-hidden="true" />}
      controls={props.trailing}
    >
      <div data-ui="gallery.videoReview.audioLane" data-audio-lane={props.lane} {...dropTarget}>
        {props.clips.map((clip) => {
          const shown =
            preview?.id === clip.id
              ? preview
              : {
                  timelineStart: reviewVoiceoverRange(clip).start,
                  duration: reviewVoiceoverRange(clip).end - reviewVoiceoverRange(clip).start,
                };
          return (
            <ReviewAudioClipBlock
              key={clip.id}
              clip={clip}
              shown={shown}
              selected={props.selectedId === clip.id}
              busy={props.busy}
              cutSuppressed={isReviewVoiceoverCut(clip, props.cutsProjection?.cuts)}
              label={props.label}
              assets={props.assets}
              waveforms={props.waveforms}
              projection={props.projection}
              snapTimes={props.snapTimes}
              duration={props.duration}
              drag={drag}
              lane={props.lane}
              clips={props.clips}
              onSelect={props.onSelect}
              onPreview={(value) => setPreview(value && { id: clip.id, ...value })}
              onCommit={commit}
              onCancel={cancelDrag}
            />
          );
        })}
        <ReviewTrackCuts projection={props.cutsProjection ?? props.projection} />
        <ReviewAudioLaneStatus
          empty={!props.clips.length}
          guide={
            preview?.guide == null
              ? null
              : (props.projection?.source(preview.guide) ?? preview.guide)
          }
          duration={props.projection?.duration ?? props.duration}
        />
      </div>
    </ReviewTrackRow>
  );
}

/** One draggable clip block; edges trim, the body moves, and Escape cancels the preview. */
function ReviewAudioClipBlock(props: {
  clip: QuickEditAudioClip;
  cutSuppressed: boolean;
  shown: { timelineStart: number; duration: number };
  selected: boolean;
  busy: boolean;
  label: string;
  duration: number;
  projection?: ReviewTrackProjection | undefined;
  snapTimes?: readonly number[] | undefined;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  assets?: ReadonlyMap<string, ReviewAudioAsset> | undefined;
  drag: MutableRefObject<AudioDragState | null>;
  lane: ReviewAudioLane;
  clips: readonly QuickEditAudioClip[];
  onSelect(id: string): void;
  onPreview(value: { timelineStart: number; duration: number; guide: number | null } | null): void;
  onCommit(): void;
  onCancel(): void;
}) {
  const clip = props.clip;
  const asset = props.assets?.get(clip.assetId);
  const assetDuration = asset?.duration ?? props.waveforms?.get(clip.assetId)?.duration;
  const filename = asset?.filename || props.label;
  const start =
    props.projection?.position(props.shown.timelineStart) ??
    props.shown.timelineStart / props.duration;
  const endTime = props.shown.timelineStart + props.shown.duration;
  const end = props.projection?.position(endTime, 'end') ?? endTime / props.duration;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${props.label} · ${filename}`}
      title={
        props.cutSuppressed
          ? `${filename} · ${translate('gallery.videoReview.voiceoverCut')}`
          : filename
      }
      aria-pressed={props.selected}
      className={`absolute inset-y-0 z-[5] cursor-grab overflow-hidden rounded border
          text-xs active:cursor-grabbing ${props.cutSuppressed ? 'opacity-45' : ''} ${
            props.selected
              ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent-soft)]'
              : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]'
          }`}
      style={{ left: `${start * 100}%`, width: `${(end - start) * 100}%` }}
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
          sourceAtPointer:
            ((event.clientX - event.currentTarget.parentElement!.getBoundingClientRect().left) /
              event.currentTarget.parentElement!.getBoundingClientRect().width) *
            (props.projection?.duration ?? props.duration),
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
        const delta =
          props.projection?.delta(
            current.sourceAtPointer,
            event.clientX - current.x,
            current.width
          ) ?? ((event.clientX - current.x) / current.width) * props.duration;
        const original = props.clips.find((item) => item.id === current.id);
        if (!original) return;
        const range = reviewVoiceoverRange(original);
        const base = { ...original, timelineStart: range.start, duration: range.end - range.start };
        const threshold = event.shiftKey
          ? -1
          : (SNAP_THRESHOLD_PX * props.duration) / current.width;
        const candidates = [
          ...(props.snapTimes ?? []),
          ...props.clips
            .filter((clip) => clip.id !== base.id && !clip.dormant)
            .flatMap((clip) => [reviewVoiceoverRange(clip).start, reviewVoiceoverRange(clip).end]),
        ];
        const start = snapTimelineTime(base.timelineStart + delta, candidates, threshold);
        const end = snapTimelineTime(
          base.timelineStart + base.duration + delta,
          candidates,
          threshold
        );
        const useEnd =
          current.edge === 'end' ||
          (current.edge === 'move' &&
            end.candidate !== null &&
            (start.candidate === null ||
              Math.abs(end.time - base.timelineStart - base.duration - delta) <
                Math.abs(start.time - base.timelineStart - delta)));
        const snapped = useEnd ? end : start;
        const next =
          current.edge === 'start'
            ? trimQuickEditAudioClip(base, 'start', start.time, props.duration, assetDuration)
            : current.edge === 'end'
              ? trimQuickEditAudioClip(base, 'end', end.time, props.duration, assetDuration)
              : moveQuickEditAudioClip(
                  base,
                  useEnd ? end.time - base.duration : start.time,
                  props.duration
                );
        props.onPreview({
          timelineStart: reviewVoiceoverRange(next).start,
          duration: reviewVoiceoverRange(next).end - reviewVoiceoverRange(next).start,
          guide: snapped.candidate,
        });
      }}
      onPointerUp={props.onCommit}
      onPointerCancel={props.onCancel}
    >
      <ReviewClipWaveform {...props} />
      {(['start', 'end'] as const).map((edge) => (
        <span
          key={edge}
          data-audio-edge={edge}
          className={`absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center
            bg-black/10 ${edge === 'start' ? 'left-0' : 'right-0'}`}
        >
          <span className="h-4 w-px bg-current opacity-60" />
        </span>
      ))}
    </div>
  );
}

/** The three semantic audio lanes; the original stays bound to the video structure. */
export function ReviewAudioTrack(props: {
  originalEditor?: ReturnType<typeof useReviewAudio> | undefined;
  edits?: readonly ReviewEdit[] | undefined;
  onOriginalRange?: ((range: ReviewAnchor) => void) | undefined;
  onSelectSpeed?: ((edit: ReviewEdit) => void) | undefined;
  audio: QuickEditAudioState;
  hasOriginalAudio?: boolean;
  showAddedAudio?: boolean;
  duration: number;
  projection?: ReviewTrackProjection | undefined;
  snapTimes?: readonly number[] | undefined;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  assets?: ReadonlyMap<string, ReviewAudioAsset> | undefined;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string | null): void;
  onMoveClip(lane: ReviewAudioLane, id: string, timelineStart: number): void;
  onTrimClip(
    lane: ReviewAudioLane,
    id: string,
    edge: 'start' | 'end',
    timelineTime: number,
    assetDuration?: number
  ): void;
  onOriginal(patch: Partial<QuickEditOriginalAudio>): void;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onMuteLane?: ((lane: ReviewAudioLane) => void) | undefined;
}) {
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<ReviewAudioLane | null>(null);
  return (
    <div data-ui="gallery.videoReview.audioTrack">
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) props.onImportFile(file, picker.current ?? 'music');
          picker.current = null;
        }}
      />
      {props.hasOriginalAudio !== false ? (
        <ReviewOriginalAudioTrack
          duration={props.duration}
          editor={props.originalEditor}
          edits={props.edits}
          onRange={props.onOriginalRange}
          onSelectSpeed={props.onSelectSpeed}
          waveform={props.waveforms?.get('original')}
          original={props.audio.original}
          projection={props.projection}
          busy={props.busy}
          onOriginal={props.onOriginal}
        />
      ) : null}
      {props.showAddedAudio !== false ? (
        <ReviewClipLanes
          audio={props.audio}
          assets={props.assets}
          waveforms={props.waveforms}
          onMuteLane={props.onMuteLane}
          projection={props.projection}
          snapTimes={props.snapTimes}
          duration={props.duration}
          selectedId={props.selectedId}
          busy={props.busy}
          onSelect={props.onSelect}
          onMoveClip={props.onMoveClip}
          onTrimClip={props.onTrimClip}
          onImportFile={props.onImportFile}
          onRecordVoiceover={props.onRecordVoiceover}
          pickerLane={picker}
          pickerInput={input}
        />
      ) : null}
    </div>
  );
}

function ReviewClipLanes(props: {
  audio: QuickEditAudioState;
  duration: number;
  projection?: ReviewTrackProjection | undefined;
  snapTimes?: readonly number[] | undefined;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  assets?: ReadonlyMap<string, ReviewAudioAsset> | undefined;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string | null): void;
  onMoveClip(lane: ReviewAudioLane, id: string, timelineStart: number): void;
  onTrimClip(
    lane: ReviewAudioLane,
    id: string,
    edge: 'start' | 'end',
    timelineTime: number,
    assetDuration?: number
  ): void;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onMuteLane?: ((lane: ReviewAudioLane) => void) | undefined;
  pickerLane: RefObject<ReviewAudioLane | null>;
  pickerInput: RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      {LANES.map((lane) => (
        <ReviewAudioClipLane
          key={lane.key}
          lane={lane.key}
          label={translate(lane.label)}
          clips={props.audio[lane.key]}
          assets={props.assets}
          waveforms={props.waveforms}
          projection={
            lane.key === 'voiceover' && props.audio.voiceoverSegments ? undefined : props.projection
          }
          cutsProjection={props.projection}
          snapTimes={
            lane.key === 'voiceover' && props.audio.voiceoverSegments
              ? props.snapTimes?.map((time) => props.projection?.source(time) ?? time)
              : props.snapTimes
          }
          duration={
            lane.key === 'voiceover' && props.audio.voiceoverSegments
              ? props.audio.voiceoverSegments.at(-1)!.sourceEnd
              : props.duration
          }
          selectedId={props.selectedId}
          busy={props.busy}
          onSelect={props.onSelect}
          onMoveClip={props.onMoveClip}
          onTrimClip={props.onTrimClip}
          onDropFile={(file: File, timelineTime: number) =>
            props.onImportFile(
              file,
              lane.key,
              lane.key === 'voiceover' && props.audio.voiceoverSegments
                ? (props.projection?.output(timelineTime) ?? timelineTime)
                : timelineTime
            )
          }
          trailing={
            <>
              {lane.key === 'voiceover' && (
                <ReviewButton
                  label={translate('gallery.videoReview.recordVoiceover')}
                  disabled={props.busy}
                  className={`${reviewIconButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
                  onClick={props.onRecordVoiceover}
                >
                  <Mic size={14} />
                </ReviewButton>
              )}
              <ReviewButton
                label={translate('gallery.videoReview.audioImport')}
                disabled={props.busy}
                className={`${reviewIconButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
                onClick={() => {
                  props.pickerLane.current = lane.key;
                  props.pickerInput.current?.click();
                }}
              >
                <Plus size={14} />
              </ReviewButton>
              {props.onMuteLane ? (
                <ReviewButton
                  label={translate('gallery.videoReview.audioEnabled')}
                  aria-pressed={
                    props.audio[lane.key].length > 0 &&
                    props.audio[lane.key].some((clip) => !clip.muted)
                  }
                  disabled={props.busy || !props.audio[lane.key].length}
                  className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
                  onClick={() => props.onMuteLane?.(lane.key)}
                >
                  {props.audio[lane.key].length > 0 &&
                  props.audio[lane.key].every((clip) => clip.muted) ? (
                    <VolumeX size={14} />
                  ) : (
                    <Volume2 size={14} />
                  )}
                </ReviewButton>
              ) : null}
            </>
          }
        />
      ))}
    </>
  );
}

/** Empty-lane guidance and the current magnetic alignment share the lane coordinate scale. */
function ReviewAudioLaneStatus(props: { empty: boolean; guide: number | null; duration: number }) {
  return (
    <>
      {props.empty ? (
        <p
          className="pointer-events-none absolute inset-0 flex items-center justify-center
              text-[11px] text-[var(--sniptale-color-text-muted)]"
        >
          {translate('gallery.videoReview.audioEmpty')}
        </p>
      ) : null}
      {props.guide !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--sniptale-color-accent)]"
          style={{ left: percent(props.guide, props.duration) }}
        />
      ) : null}
    </>
  );
}

/** File-drop hover and source-axis placement are independent of clip pointer trimming. */
function useAudioLaneDrop(props: {
  busy: boolean;
  duration: number;
  projection?: ReviewTrackProjection | undefined;
  onDropFile?: ((file: File, timelineTime: number) => void) | undefined;
}) {
  const [dropHover, setDropHover] = useState(false);
  const dropDepth = useRef(0);
  const drop = props.onDropFile;
  return drop
    ? {
        'data-drop-active': dropHover ? 'true' : undefined,
        className: `relative mt-1 h-8 rounded bg-[var(--sniptale-color-surface-hover)] ${
          dropHover
            ? 'outline-2 outline-offset-[-1px] outline-[var(--sniptale-color-border-accent-strong)]'
            : ''
        }`,
        onDragEnter: (event: DragEvent<HTMLDivElement>) => {
          if (props.busy || !dragHasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          dropDepth.current += 1;
          setDropHover(true);
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (props.busy || !dragHasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          if (dropDepth.current === 0) return;
          event.preventDefault();
          dropDepth.current = Math.max(0, dropDepth.current - 1);
          if (dropDepth.current === 0) setDropHover(false);
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (props.busy || !dragHasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          dropDepth.current = 0;
          setDropHover(false);
          const file = event.dataTransfer.files[0];
          if (!file) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const time =
            rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * props.duration : 0;
          const sourceTime =
            rect.width > 0
              ? ((event.clientX - rect.left) / rect.width) *
                (props.projection?.duration ?? props.duration)
              : 0;
          drop(
            file,
            props.projection?.output(sourceTime) ?? Math.max(0, Math.min(time, props.duration))
          );
        },
      }
    : {
        className: 'relative mt-1 h-8 rounded bg-[var(--sniptale-color-surface-hover)]',
      };
}

/** Maps retained source-time recordings to their original waveform samples. */
function ReviewClipWaveform(
  props: Pick<
    Parameters<typeof ReviewAudioClipBlock>[0],
    'clip' | 'shown' | 'projection' | 'waveforms' | 'cutSuppressed'
  >
) {
  const clip = props.clip;
  const sampleTime = useCallback(
    (fraction: number) =>
      clip.sourceAnchor
        ? reviewVoiceoverOffset(clip, props.shown.timelineStart + fraction * props.shown.duration) -
          reviewVoiceoverOffset(clip, props.shown.timelineStart)
        : fraction * props.shown.duration,
    [clip, props.shown.timelineStart, props.shown.duration]
  );
  return (
    <ReviewAudioWaveform
      waveform={props.waveforms?.get(clip.assetId)}
      projection={props.projection}
      timelineStart={props.shown.timelineStart}
      offset={
        clip.sourceAnchor
          ? clip.sourceOffset + reviewVoiceoverOffset(clip, props.shown.timelineStart)
          : clip.sourceOffset +
            (props.shown.duration !== clip.duration
              ? props.shown.timelineStart - clip.timelineStart
              : 0)
      }
      duration={clip.sourceAnchor ? clip.duration : props.shown.duration}
      sampleTime={clip.sourceAnchor ? sampleTime : undefined}
      volume={clip.volume}
      muted={clip.muted || props.cutSuppressed}
      fadeIn={clip.fadeIn}
      fadeOut={clip.fadeOut}
    />
  );
}
