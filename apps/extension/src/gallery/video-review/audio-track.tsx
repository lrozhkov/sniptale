import { retimeReviewVoiceover } from '../../features/video/review/voiceover-timing';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import { ReviewOriginalAudioTrack } from './original-audio-track';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { useReviewAudio } from './use-review-audio';
import {
  isReviewVoiceoverCut,
  reviewVoiceoverPlaybackDuration,
  reviewVoiceoverRange,
  reviewVoiceoverOffset,
} from '../../features/video/review/voiceover-edits';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
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
import { reviewAudioClipRows, type ReviewTrackProjection } from './track-projection';
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
  admission: ReturnType<typeof deferReviewGesture>;
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

type ReviewAudioTimelineProps = {
  beforeAction?: ReviewBeforeAction | undefined;
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
};

type ReviewAudioClipLaneProps = ReviewAudioTimelineProps & {
  lane: ReviewAudioLane;
  label: string;
  clips: readonly QuickEditAudioClip[];
  onDropFile?: (file: File, timelineTime: number) => void;
  trailing?: ReactNode;
  cutsProjection?: ReviewTrackProjection | undefined;
  voiceoverSegments?: QuickEditAudioState['voiceoverSegments'] | undefined;
};

type ReviewAudioTrackProps = ReviewAudioTimelineProps & {
  originalEditor?: ReturnType<typeof useReviewAudio> | undefined;
  selectedEditId?: string | undefined;
  edits?: readonly ReviewEdit[] | undefined;
  onOriginalRange?: ((range: ReviewAnchor) => void) | undefined;
  onSelectSpeed?: ((edit: ReviewEdit) => void) | undefined;
  audio: QuickEditAudioState;
  hasOriginalAudio?: boolean;
  showAddedAudio?: boolean;
  onOriginal(patch: Partial<QuickEditOriginalAudio>): void;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onMuteLane?: ((lane: ReviewAudioLane) => void) | undefined;
};

type ReviewClipLanesProps = ReviewAudioTimelineProps & {
  audio: QuickEditAudioState;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onMuteLane?: ((lane: ReviewAudioLane) => void) | undefined;
  pickerLane: RefObject<ReviewAudioLane | null>;
  pickerInput: RefObject<HTMLInputElement | null>;
};

/** One semantic clip lane: move drags the block, the edges trim inside the timeline. */
function ReviewAudioClipLane(props: ReviewAudioClipLaneProps) {
  const [preview, setPreview] = useState<{
    clip: QuickEditAudioClip;
    guide: number | null;
  } | null>(null);
  const dropTarget = useAudioLaneDrop(props);
  const drag = useRef<AudioDragState | null>(null);
  const cancelDrag = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    current?.admission.cancel();
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
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    if (!current || !shown || !current.moved) return;
    const assetId = props.clips.find((clip) => clip.id === current.id)?.assetId ?? '';
    const assetDuration =
      props.assets?.get(assetId)?.duration ?? props.waveforms?.get(assetId)?.duration;
    const range = reviewVoiceoverRange(shown.clip);
    current.admission.commit(() => {
      if (current.edge === 'start')
        props.onTrimClip(current.lane, current.id, 'start', range.start, assetDuration);
      else if (current.edge === 'end')
        props.onTrimClip(current.lane, current.id, 'end', range.end, assetDuration);
      else props.onMoveClip(current.lane, current.id, range.start);
    });
  };
  const rows = reviewAudioClipRows(
    props.clips.map((stored) => ({
      id: stored.id,
      ...reviewVoiceoverRange(retimeReviewVoiceover(stored, props.voiceoverSegments)),
    }))
  );
  const rowCount = Math.max(1, ...[...rows.values()].map((row) => row + 1));
  return (
    <ReviewTrackRow
      muted={props.clips.length > 0 && props.clips.every((clip) => clip.muted)}
      label={props.label}
      icon={<AudioLines size={14} aria-hidden="true" />}
      controls={props.trailing}
    >
      <div
        data-ui="gallery.videoReview.audioLane"
        data-audio-lane={props.lane}
        {...dropTarget}
        style={{ height: rowCount * 36 - 4 }}
      >
        {props.clips.flatMap((stored) => {
          const clip = retimeReviewVoiceover(stored, props.voiceoverSegments);
          const shown = preview?.clip.id === clip.id ? preview.clip : clip;
          const pieces =
            props.lane === 'music' && props.projection
              ? props.projection.slices(shown.timelineStart, shown.timelineStart + shown.duration)
              : [undefined];
          return (
            <ReviewAudioClipBlock
              key={clip.id}
              row={rows.get(clip.id) ?? 0}
              pieces={pieces}
              clip={clip}
              shown={shown}
              selected={props.selectedId === clip.id}
              busy={props.busy}
              cutSuppressed={isReviewVoiceoverCut(shown, props.cutsProjection?.cuts)}
              label={props.label}
              assets={props.assets}
              waveforms={props.waveforms}
              projection={props.projection}
              sourceProjection={props.cutsProjection}
              voiceoverSegments={props.voiceoverSegments}
              snapTimes={props.snapTimes}
              duration={props.duration}
              drag={drag}
              lane={props.lane}
              clips={props.clips}
              beforeAction={props.beforeAction}
              onSelect={props.onSelect}
              onPreview={setPreview}
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
type ReviewAudioClipBlockProps = {
  row: number;
  pieces: readonly (ReturnType<ReviewTrackProjection['slices']>[number] | undefined)[];
  clip: QuickEditAudioClip;
  cutSuppressed: boolean;
  shown: QuickEditAudioClip;
  sourceProjection?: ReviewTrackProjection | undefined;
  voiceoverSegments?: QuickEditAudioState['voiceoverSegments'];
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
  beforeAction?: ReviewBeforeAction | undefined;
  onSelect(id: string): void;
  onPreview(value: { clip: QuickEditAudioClip; guide: number | null } | null): void;
  onCommit(): void;
  onCancel(): void;
};

function ReviewAudioClipBlock(props: ReviewAudioClipBlockProps) {
  const clip = props.clip;
  const asset = props.assets?.get(clip.assetId);
  const assetDuration = asset?.duration ?? props.waveforms?.get(clip.assetId)?.duration;
  const filename = asset?.filename || props.label;
  const accessibleLabel = `${props.label} · ${filename}${
    props.cutSuppressed ? ` · ${translate('gallery.videoReview.voiceoverCut')}` : ''
  }`;
  const shownRange = reviewVoiceoverRange(props.shown);
  const start = props.projection?.position(shownRange.start) ?? shownRange.start / props.duration;
  const endTime = shownRange.end;
  const end = props.projection?.position(endTime, 'end') ?? endTime / props.duration;
  return (
    <div
      role="button"
      data-audio-id={clip.id}
      tabIndex={0}
      aria-label={accessibleLabel}
      data-cut-suppressed={props.cutSuppressed ? 'true' : 'false'}
      title={
        props.cutSuppressed
          ? `${filename} · ${translate('gallery.videoReview.voiceoverCut')}`
          : filename
      }
      aria-pressed={props.selected}
      className="pointer-events-none absolute z-[5] cursor-grab rounded text-xs active:cursor-grabbing
        focus-visible:outline focus-visible:outline-[var(--sniptale-color-accent)]"
      style={{
        left: `${start * 100}%`,
        width: `${(end - start) * 100}%`,
        top: props.row * 36,
        height: 32,
      }}
      {...reviewAudioClipGesture(props, assetDuration)}
    >
      {props.pieces.map((piece, index) => {
        const left = piece
          ? piece.sourceStart / (props.projection?.duration ?? props.duration)
          : start;
        const right = piece
          ? piece.sourceEnd / (props.projection?.duration ?? props.duration)
          : end;
        return (
          <div
            key={index}
            data-music-offset={
              piece ? props.shown.sourceOffset + piece.start - props.shown.timelineStart : undefined
            }
            className={`pointer-events-auto absolute inset-y-0 overflow-hidden rounded border
              ${reviewTimelineItemTone(props.selected)}`}
            style={{
              left: `${((left - start) / (end - start)) * 100}%`,
              width: `${((right - left) / (end - start)) * 100}%`,
            }}
          >
            <ReviewClipWaveform {...props} piece={piece} />
            {(['start', 'end'] as const)
              .filter((edge) =>
                edge === 'start' ? index === 0 : index === props.pieces.length - 1
              )
              .map((edge) => (
                <span
                  key={edge}
                  data-audio-edge={edge}
                  className={`${reviewTimelineResizeHandleClassName} ${edge === 'start' ? 'left-0' : 'right-0'}`}
                >
                  <span className="h-4 w-px bg-current opacity-60" />
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}

/** Owns admission, capture, source-time trim/move preview and completion for one clip gesture. */
function reviewAudioClipGesture(props: ReviewAudioClipBlockProps, assetDuration?: number) {
  const clip = props.clip;
  return {
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (props.busy || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      (props.beforeAction ?? ((action) => action()))(() => props.onSelect(clip.id));
    },
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || props.busy) return;
      event.stopPropagation();
      const admission = deferReviewGesture(props.beforeAction, () => props.onSelect(clip.id));
      const edge =
        event.target instanceof Element
          ? event.target.closest('[data-audio-edge]')?.getAttribute('data-audio-edge')
          : null;
      props.drag.current = {
        admission,
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
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = props.drag.current;
      if (!current || current.width <= 0) return;
      current.moved ||= Math.abs(event.clientX - current.x) > 3;
      const delta =
        props.projection?.delta(
          current.sourceAtPointer,
          event.clientX - current.x,
          current.width
        ) ?? ((event.clientX - current.x) / current.width) * props.duration;
      const stored = props.clips.find((item) => item.id === current.id);
      if (!stored) return;
      const original = retimeReviewVoiceover(stored, props.voiceoverSegments);
      const range = reviewVoiceoverRange(original);
      const base = { ...original, timelineStart: range.start, duration: range.end - range.start };
      const threshold = event.shiftKey ? -1 : (SNAP_THRESHOLD_PX * props.duration) / current.width;
      const candidates = [
        ...(props.snapTimes ?? []),
        ...props.clips
          .filter((clip) => clip.id !== base.id && !clip.dormant)
          .flatMap((clip) => {
            const range = reviewVoiceoverRange(
              retimeReviewVoiceover(clip, props.voiceoverSegments)
            );
            return [range.start, range.end];
          }),
      ];
      const start = snapTimelineTime(base.timelineStart + delta, candidates, threshold);
      const mapped =
        original.sourceAnchor && !props.cutSuppressed ? props.sourceProjection : undefined;
      const playbackDuration = original.sourceAnchor
        ? reviewVoiceoverPlaybackDuration(original, props.voiceoverSegments)
        : original.duration;
      const movedEnd = mapped
        ? mapped.source(mapped.output(base.timelineStart + delta) + playbackDuration, 'end')
        : base.timelineStart + base.duration + delta;
      const requestedEnd =
        current.edge === 'move' ? movedEnd : base.timelineStart + base.duration + delta;
      const end = snapTimelineTime(requestedEnd, candidates, threshold);
      const useEnd =
        current.edge === 'end' ||
        (current.edge === 'move' &&
          end.candidate !== null &&
          (start.candidate === null ||
            Math.abs(end.time - requestedEnd) < Math.abs(start.time - base.timelineStart - delta)));
      const snapped = useEnd ? end : start;
      const next =
        current.edge === 'start'
          ? trimQuickEditAudioClip(
              base,
              'start',
              start.time,
              props.duration,
              assetDuration,
              props.voiceoverSegments
            )
          : current.edge === 'end'
            ? trimQuickEditAudioClip(
                base,
                'end',
                end.time,
                props.duration,
                assetDuration,
                props.voiceoverSegments
              )
            : moveQuickEditAudioClip(
                base,
                useEnd
                  ? mapped
                    ? mapped.source(mapped.output(end.time) - playbackDuration)
                    : end.time - base.duration
                  : start.time,
                props.duration,
                props.voiceoverSegments
              );
      props.onPreview({
        clip: next,
        guide: snapped.candidate,
      });
    },
    onPointerUp: props.onCommit,
    onPointerCancel: props.onCancel,
  };
}

/** The three semantic audio lanes; the original stays bound to the video structure. */
export function ReviewAudioTrack(props: ReviewAudioTrackProps) {
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
          beforeAction={props.beforeAction}
          duration={props.duration}
          editor={props.originalEditor}
          selectedEditId={props.selectedEditId}
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
          beforeAction={props.beforeAction}
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

function ReviewClipLanes(props: ReviewClipLanesProps) {
  return (
    <>
      {LANES.map((lane) => (
        <ReviewAudioClipLane
          key={lane.key}
          lane={lane.key}
          label={translate(lane.label)}
          clips={props.audio[lane.key]}
          voiceoverSegments={lane.key === 'voiceover' ? props.audio.voiceoverSegments : undefined}
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
          beforeAction={props.beforeAction}
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
                  onClick={() =>
                    (props.beforeAction ?? ((action) => action()))(() =>
                      props.onMuteLane?.(lane.key)
                    )
                  }
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
  > & { piece: ReturnType<ReviewTrackProjection['slices']>[number] | undefined }
) {
  const clip = props.shown;
  const range = reviewVoiceoverRange(clip);
  const sampleTime = useCallback(
    (fraction: number) =>
      props.piece && props.projection
        ? props.projection.output(
            props.piece.sourceStart + fraction * (props.piece.sourceEnd - props.piece.sourceStart)
          ) - clip.timelineStart
        : reviewVoiceoverOffset(clip, range.start + fraction * (range.end - range.start)),
    [clip, range.start, range.end, props.piece, props.projection]
  );
  return (
    <ReviewAudioWaveform
      waveform={props.waveforms?.get(clip.assetId)}
      projection={props.projection}
      timelineStart={range.start}
      offset={clip.sourceOffset}
      duration={clip.duration}
      sampleTime={clip.sourceAnchor || props.piece ? sampleTime : undefined}
      volume={clip.volume}
      muted={clip.muted || props.cutSuppressed}
      fadeIn={clip.fadeIn}
      fadeOut={clip.fadeOut}
    />
  );
}
