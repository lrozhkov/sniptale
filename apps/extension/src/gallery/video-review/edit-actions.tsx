import { SelectField } from '../../ui/compact-inspector-controls';
import { reviewSelectFieldClassName } from './controls';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { useMemo, useState, useId, type ReactNode } from 'react';
import { createReviewFragment } from '../../features/video/review/fragment';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import {
  REVIEW_SPEED_RATES,
  isReviewSpeedRate,
  type ReviewSpeedRate,
} from '../../features/video/review/speed';
import {
  Scissors,
  Download,
  FileVideo,
  Gauge,
  MousePointer2,
  Trash2,
  Settings2,
} from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { QuickEditExportReason } from '../../features/video/review/advanced/effective';
import {
  reviewIconButtonClassName,
  ReviewButton,
  reviewTextButtonClassName,
  reviewTimeLabel,
} from './controls';

const REASON_LABEL: Record<QuickEditExportReason, Parameters<typeof translate>[0]> = {
  canvas: 'gallery.videoReview.canvas',
  'precise-edits': 'gallery.videoReview.exportPreciseEdits',
  zoom: 'gallery.videoReview.exportBlockerZoom',
  background: 'gallery.videoReview.exportBlockerBackground',
  comments: 'gallery.videoReview.exportBlockerComments',
  voiceover: 'gallery.videoReview.exportBlockerVoiceover',
  music: 'gallery.videoReview.exportBlockerMusic',
  'original-audio': 'gallery.videoReview.exportBlockerOriginalAudio',
  'audio-encoder': 'gallery.videoReview.exportBlockerAudioEncoder',
  'video-encoder': 'gallery.videoReview.exportBlockerVideoEncoder',
  'asset-missing': 'gallery.videoReview.exportBlockerAssetMissing',
};

const plain = reviewIconButtonClassName;

/** The timeline owns the editing tools; a drag applies the current tool directly. */
export function ReviewTimelineTools(props: {
  mode: 'cut' | 'speed' | null;
  available: boolean;
  cutAvailable?: boolean;
  speedAvailable?: boolean;
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
        disabled={!props.available || props.busy || props.cutAvailable === false}
        onClick={() => props.onToggle('cut')}
      >
        <Scissors size={16} />
      </ReviewButton>
      <ReviewButton
        label={translate('gallery.videoReview.speedMode')}
        aria-pressed={props.mode === 'speed'}
        className={plain}
        disabled={!props.available || props.busy || props.speedAvailable === false}
        onClick={() => props.onToggle('speed')}
      >
        <Gauge size={16} />
      </ReviewButton>
      {props.mode === 'speed' ? <ReviewSpeedOptions {...props} /> : null}
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

/** Compact speed choices shared by the timeline tool and selected-edit inspector. */
export function ReviewSpeedOptions(props: {
  layout?: 'toolbar' | 'inspector';
  rate: number;
  audio: 'speed' | 'mute';
  busy: boolean;
  onRate(value: ReviewSpeedRate): void;
  onAudio(value: 'speed' | 'mute'): void;
}) {
  const rateOptions = REVIEW_SPEED_RATES.map((rate) => ({
    value: String(rate),
    label: `${rate < 0.25 ? `1/${1 / rate}` : rate}×`,
  }));
  const audioOptions = [
    { value: 'speed' as const, label: translate('gallery.videoReview.speedSound') },
    { value: 'mute' as const, label: translate('gallery.videoReview.muteSound') },
  ];
  const changeRate = (value: string) => {
    const rate = Number(value);
    if (isReviewSpeedRate(rate)) props.onRate(rate);
  };
  if (props.layout === 'inspector')
    return (
      <>
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.speedRate')}
          value={String(props.rate)}
          disabled={props.busy}
          options={rateOptions}
          onChange={changeRate}
        />
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.speedAudio')}
          value={props.audio}
          disabled={props.busy}
          options={audioOptions}
          onChange={props.onAudio}
        />
      </>
    );
  return (
    <>
      <ProductSelect
        aria-label={translate('gallery.videoReview.speedRate')}
        controlSize="sm"
        className="!h-8 !min-h-8 !w-auto !min-w-0 !py-0"
        containerClassName="!w-auto !min-w-0 shrink-0"
        menuWidth={112}
        value={String(props.rate)}
        disabled={props.busy}
        options={rateOptions}
        onChange={changeRate}
      />
      <ProductSelect<'speed' | 'mute'>
        aria-label={translate('gallery.videoReview.speedAudio')}
        controlSize="sm"
        className="!h-8 !min-h-8 !w-auto !min-w-0 !py-0"
        containerClassName="!w-auto !min-w-0 shrink-0"
        menuWidth={180}
        value={props.audio}
        disabled={props.busy}
        onChange={props.onAudio}
        options={audioOptions}
      />
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
  settings?: ReactNode;
  audioUnavailable?: boolean;
  advancedBlockers?: readonly QuickEditExportReason[] | null;
  onExport(): void;
  onCancel(): void;
  onDownload(): void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsId = useId();
  const running = props.phase !== 'idle';
  const blocked = !!props.advancedBlockers?.length;
  return (
    <div className="space-y-2">
      <div
        className={
          'sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 ' +
          'bg-[color:rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]'
        }
      >
        <ReviewButton
          label={translate('gallery.videoReview.exportVideo')}
          className={`${reviewTextButtonClassName}
            !w-full min-w-0 justify-start !whitespace-normal !text-left !leading-tight`}
          disabled={!props.available || props.busy || running || props.audioUnavailable || blocked}
          onClick={props.onExport}
        >
          <FileVideo size={15} />
          <span>{translate('gallery.videoReview.exportVideo')}</span>
        </ReviewButton>
        {props.settings ? (
          <ReviewButton
            label={translate('gallery.videoReview.exportSettings')}
            className={plain}
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={16} />
          </ReviewButton>
        ) : null}
        <ReviewButton
          label={translate('gallery.videoReview.downloadVideo')}
          className={`${reviewTextButtonClassName} col-span-2 !w-full justify-start`}
          disabled={
            running ||
            props.busy ||
            blocked ||
            (props.hasEdits && (!props.available || props.audioUnavailable))
          }
          onClick={props.onDownload}
        >
          <Download size={16} />
          <span>{translate('gallery.videoReview.downloadVideo')}</span>
        </ReviewButton>
      </div>
      {props.settings && settingsOpen ? <div id={settingsId}>{props.settings}</div> : null}
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
              className={reviewTextButtonClassName}
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
      {blocked ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.exportAdvancedUnavailable')}{' '}
          {props.advancedBlockers!.map((blocker) => translate(REASON_LABEL[blocker])).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/** A range-only download affordance; unavailable or fully removed intervals cannot be exported. */
export function ReviewFragmentAction(props: {
  selection: ReviewAnchor;
  snapToKeyframes?: boolean;
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
            snapToKeyframes: props.snapToKeyframes !== false,
            edits,
          })
        : null,
    [selection, index, edits, props.snapToKeyframes]
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

/** Render-only choices list only encoders admitted for this source container. */
export function ReviewRenderOptions({
  exporter,
  busy,
}: {
  exporter: ReturnType<typeof import('./use-export').useReviewExport>;
  busy: boolean;
}) {
  const plan = exporter.plan();
  if (plan.kind !== 'ready' || plan.video !== 'render' || !exporter.renderSettings) return null;
  const settings = exporter.renderSettings;
  const codecs =
    exporter.index?.supportedVideoCodecs ??
    (exporter.index?.processedVideoCodec ? [exporter.index.processedVideoCodec] : []);
  return (
    <div className="pt-2 text-xs" data-ui="gallery.videoReview.exportSettings">
      <fieldset disabled={busy} className="space-y-2 pb-2">
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.exportCodec')}
          disabled={busy}
          value={settings.codec ?? exporter.index?.processedVideoCodec ?? ''}
          options={codecs.map((codec) => ({
            value: codec,
            label: codec === 'avc' ? 'H.264' : codec.toUpperCase(),
          }))}
          onChange={(codec) => exporter.setRenderSettings({ ...settings, codec })}
        />
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.exportFrameRate')}
          disabled={busy}
          value={String(settings.frameRate)}
          options={[
            { value: '0', label: translate('gallery.videoReview.exportSourceRate') },
            ...[24, 30, 60].map((fps) => ({ value: String(fps), label: String(fps) })),
          ]}
          onChange={(value) => {
            const frameRate = Number(value);
            if (frameRate === 0 || frameRate === 24 || frameRate === 30 || frameRate === 60)
              exporter.setRenderSettings({ ...settings, frameRate });
          }}
        />
        <SelectField<'standard' | 'high'>
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.exportQuality')}
          disabled={busy}
          value={settings.quality}
          options={[
            { value: 'standard', label: translate('gallery.videoReview.exportStandardQuality') },
            { value: 'high', label: translate('gallery.videoReview.exportHighQuality') },
          ]}
          onChange={(quality) => exporter.setRenderSettings({ ...settings, quality })}
        />
      </fieldset>
    </div>
  );
}
