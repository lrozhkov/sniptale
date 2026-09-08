import { useMemo } from 'react';
import { createReviewFragment } from '../../features/video/review/fragment';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import {
  REVIEW_SPEED_RATES,
  isReviewSpeedRate,
  type ReviewSpeedRate,
} from '../../features/video/review/speed';
import { Scissors, Download, FileVideo, Gauge, MousePointer2, Trash2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTimeLabel } from './controls';

const plain =
  '!border-0 !bg-transparent !shadow-none !h-8 !w-8 aria-pressed:!bg-[var(--sniptale-color-accent-soft)]';

/** The timeline owns the editing tools; a drag applies the current tool directly. */
export function ReviewTimelineTools(props: {
  mode: 'cut' | 'speed' | null;
  available: boolean;
  busy: boolean;
  rate: number;
  audio: 'speed' | 'mute';
  selected: boolean;
  onPointer(): void;
  onToggle(kind: 'cut' | 'speed'): void;
  onRemove(): void;
  onRate(value: ReviewSpeedRate): void;
  onAudio(value: 'speed' | 'mute'): void;
}) {
  return (
    <>
      <ReviewButton
        label={translate('gallery.videoReview.pointerTool')}
        aria-pressed={props.mode === null}
        className={plain}
        onClick={props.onPointer}
      >
        <MousePointer2 size={16} />
      </ReviewButton>
      <ReviewButton
        label={translate('gallery.videoReview.cutMode')}
        title={translate('gallery.videoReview.cutGesture')}
        aria-pressed={props.mode === 'cut'}
        className={plain}
        disabled={!props.available || props.busy}
        onClick={() => props.onToggle('cut')}
      >
        <Scissors size={16} />
      </ReviewButton>
      <ReviewButton
        label={translate('gallery.videoReview.speedMode')}
        aria-pressed={props.mode === 'speed'}
        className={plain}
        disabled={!props.available || props.busy}
        onClick={() => props.onToggle('speed')}
      >
        <Gauge size={16} />
      </ReviewButton>
      {props.mode === 'speed' ? (
        <>
          <select
            aria-label={translate('gallery.videoReview.speedRate')}
            value={props.rate}
            disabled={props.busy}
            className="h-7 rounded bg-[var(--sniptale-color-surface-panel)] text-xs"
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (isReviewSpeedRate(value)) props.onRate(value);
            }}
          >
            {REVIEW_SPEED_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate < 0.25 ? `1/${1 / rate}` : rate}×
              </option>
            ))}
          </select>
          <select
            aria-label={translate('gallery.videoReview.speedAudio')}
            value={props.audio}
            disabled={props.busy}
            className="h-7 max-w-28 rounded bg-[var(--sniptale-color-surface-panel)] text-xs"
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'speed' || value === 'mute') props.onAudio(value);
            }}
          >
            <option value="speed">{translate('gallery.videoReview.speedSound')}</option>
            <option value="mute">{translate('gallery.videoReview.muteSound')}</option>
          </select>
        </>
      ) : null}
      {props.selected ? (
        <ReviewButton
          label={translate('gallery.videoReview.removeEdit')}
          className={plain}
          disabled={props.busy}
          onClick={props.onRemove}
        >
          <Trash2 size={15} />
        </ReviewButton>
      ) : null}
    </>
  );
}

/** Export is a footer action; editing tools live above the timeline. */
export function ReviewEditActions(props: {
  available: boolean;
  hasEdits: boolean;
  busy: boolean;
  phase: 'idle' | 'exporting' | 'publishing';
  progress: number;
  failed: boolean;
  hasResult: boolean;
  audioUnavailable?: boolean;
  onExport(): void;
  onCancel(): void;
  onDownload(): void;
}) {
  const running = props.phase !== 'idle';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.exportVideo')}
          primary
          className="flex-1"
          disabled={!props.available || props.busy || running || props.audioUnavailable}
          onClick={props.onExport}
        >
          <FileVideo size={15} />
          <span>{translate('gallery.videoReview.exportVideo')}</span>
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.downloadVideo')}
          disabled={
            running ||
            props.busy ||
            (props.hasEdits && (!props.available || props.audioUnavailable))
          }
          onClick={props.onDownload}
        >
          <Download size={16} />
        </ReviewButton>
      </div>
      {running ? (
        <div className="flex items-center justify-between gap-2 text-xs" role="status">
          <span>
            {props.phase === 'publishing'
              ? translate('gallery.videoReview.publishing')
              : `${translate('gallery.videoReview.exporting')} ${props.progress}%`}
          </span>
          {props.phase === 'exporting' ? (
            <ReviewButton
              label={translate('gallery.videoReview.cancelExport')}
              onClick={props.onCancel}
            />
          ) : null}
        </div>
      ) : null}
      {props.failed ? (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.exportFailed')}
        </p>
      ) : null}
      {props.audioUnavailable ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.speedAudioUnavailable')}
        </p>
      ) : null}
    </div>
  );
}

/** A range-only download affordance; unavailable or fully removed intervals cannot be exported. */
export function ReviewFragmentAction(props: {
  selection: ReviewAnchor;
  index: ReviewMediaIndex | null;
  edits: readonly ReviewEdit[];
  busy: boolean;
  onDownload(selection: Extract<ReviewAnchor, { kind: 'range' }>): void;
}) {
  const { selection, index, edits } = props;
  const fragment = useMemo(
    () =>
      index
        ? createReviewFragment({
            selection,
            duration: index.duration,
            boundaries: index.boundaries,
            edits,
          })
        : null,
    [selection, index, edits]
  );
  if (selection.kind !== 'range') return null;
  const audioUnavailable =
    !!index?.audioCodec &&
    !index.processedAudioCodec &&
    fragment?.edits.some((edit) => edit.kind === 'speed');
  const hint = translate('gallery.videoReview.downloadSelectionHint');
  const rangeLabel = fragment
    ? `${reviewTimeLabel(fragment.start)} – ${reviewTimeLabel(fragment.end)}. `
    : '';
  return (
    <ReviewButton
      label={translate('gallery.videoReview.downloadSelection')}
      title={rangeLabel + hint}
      disabled={!fragment || props.busy || audioUnavailable}
      className={plain}
      onClick={() => props.onDownload(selection)}
    >
      <Download size={16} />
    </ReviewButton>
  );
}
