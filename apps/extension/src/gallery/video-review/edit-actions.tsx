import { VideoExportTimeHint } from '../../ui/video-export/time-estimate';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { VideoExportSizeHint } from '../../ui/video-export/size-estimate';
import {
  type VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { reviewOutputCodecs } from '../../workflows/video-review/render-settings';
import { SelectField } from '../../ui/compact-inspector-controls';
import { reviewSelectFieldClassName } from './controls';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { useEffect, useMemo, type ReactNode } from 'react';
import { createReviewFragment } from '../../features/video/review/fragment';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import {
  REVIEW_SPEED_RATES,
  isReviewSpeedRate,
  type ReviewSpeedRate,
} from '../../features/video/review/speed';
import { Scissors, Download, FileVideo, Gauge, MousePointer2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { QuickEditExportReason } from '../../features/video/review/advanced/effective';
import type { QuickEditCameraConflict } from '../../features/video/review/advanced/scene';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import {
  reviewIconButtonClassName,
  ReviewButton,
  ReviewToolGroup,
  reviewTextButtonClassName,
  reviewTimeLabel,
} from './controls';

const REASON_LABEL: Record<QuickEditExportReason, Parameters<typeof translate>[0]> = {
  canvas: 'gallery.videoReview.canvas',
  'canvas-size': 'gallery.videoReview.exportBlockerCanvasSize',
  'key-animations': 'gallery.videoReview.keyDisplay',
  'click-animations': 'gallery.videoReview.clickAnimation',
  'window-header': 'gallery.videoReview.windowHeader',
  webcam: 'gallery.videoReview.webcam',
  watermark: 'gallery.videoReview.watermark',
  captions: 'gallery.videoReview.captions',
  'annotation-effects': 'gallery.videoReview.annotationEffects',
  'caption-layout': 'gallery.videoReview.captionConflict',
  'camera-follow': 'gallery.videoReview.cameraFollowConflict',
  presentation: 'gallery.videoReview.presentation',
  'precise-edits': 'gallery.videoReview.exportPreciseEdits',
  'cut-transition': 'gallery.videoReview.cutTransition',
  'transition-frames': 'gallery.videoReview.cutTransitionFramesUnavailable',
  zoom: 'gallery.videoReview.exportBlockerZoom',
  background: 'gallery.videoReview.exportBlockerBackground',
  comments: 'gallery.videoReview.exportBlockerComments',
  voiceover: 'gallery.videoReview.exportBlockerVoiceover',
  music: 'gallery.videoReview.exportBlockerMusic',
  'action-audio': 'gallery.videoReview.actionAudio',
  'action-audio-limit': 'gallery.videoReview.actionAudioLimit',
  'action-audio-resource': 'gallery.videoReview.actionAudioResource',
  'original-audio': 'gallery.videoReview.exportBlockerOriginalAudio',
  'audio-encoder': 'gallery.videoReview.exportBlockerAudioEncoder',
  'video-encoder': 'gallery.videoReview.exportBlockerVideoEncoder',
  'asset-missing': 'gallery.videoReview.exportBlockerAssetMissing',
};

const plain = reviewIconButtonClassName;

const CAMERA_REASON_LABEL: Record<
  QuickEditCameraConflict['reason'],
  Parameters<typeof translate>[0]
> = {
  dynamics: 'gallery.videoReview.cameraConflictDynamics',
  pose: 'gallery.videoReview.cameraConflictPose',
  raster: 'gallery.videoReview.cameraConflictRaster',
  viewport: 'gallery.videoReview.cameraConflictViewport',
  projection: 'gallery.videoReview.cameraConflictProjection',
  unproven: 'gallery.videoReview.cameraConflictUnproven',
};

/** The timeline owns the editing tools; a drag applies the current tool directly. */
export function ReviewTimelineTools(props: {
  mode: 'cut' | 'speed' | 'audio' | 'focus' | 'annotation' | null;
  sourceTools?: boolean;
  available: boolean;
  cutAvailable?: boolean;
  cutHint?: string | undefined;
  speedHint?: string | undefined;
  speedAvailable?: boolean;
  busy: boolean;
  rate: number;
  audio: 'speed' | 'mute';
  onPointer(): void;
  onToggle(kind: 'cut' | 'speed'): void;
  onRate(value: ReviewSpeedRate): void;
  onAudio(value: 'speed' | 'mute'): void;
}) {
  return (
    <>
      <ReviewButton
        label={translate('gallery.videoReview.pointerTool')}
        toolbarLabel={translate('gallery.videoReview.toolbarPointer')}
        aria-pressed={props.mode === null}
        className={plain}
        onClick={props.onPointer}
      >
        <MousePointer2 size={16} />
      </ReviewButton>
      {props.sourceTools !== false ? (
        <>
          <ReviewButton
            label={translate('gallery.videoReview.cutMode')}
            toolbarLabel={translate('gallery.videoReview.toolbarCut')}
            title={props.cutHint ?? translate('gallery.videoReview.cutGesture')}
            aria-pressed={props.mode === 'cut'}
            className={plain}
            disabled={!props.available || props.busy || props.cutAvailable === false}
            onClick={() => props.onToggle('cut')}
          >
            <Scissors size={16} />
          </ReviewButton>
          <ReviewToolGroup
            active={props.mode === 'speed'}
            label={translate('gallery.videoReview.speedMode')}
          >
            <ReviewButton
              label={translate('gallery.videoReview.speedMode')}
              toolbarLabel={translate('gallery.videoReview.speedMode')}
              title={props.speedHint ?? translate('gallery.videoReview.speedMode')}
              aria-pressed={props.mode === 'speed'}
              className={plain}
              disabled={!props.available || props.busy || props.speedAvailable === false}
              onClick={() => props.onToggle('speed')}
            >
              <Gauge size={16} />
            </ReviewButton>
            {props.mode === 'speed' ? <ReviewSpeedOptions {...props} /> : null}
          </ReviewToolGroup>
        </>
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
        menuClassName="sniptale-parameter-menu"
        aria-label={translate('gallery.videoReview.speedRate')}
        controlSize="sm"
        className={`${reviewTextButtonClassName} !min-w-0 !py-0 !font-normal`}
        containerClassName="!w-auto !min-w-0 shrink-0"
        menuWidth={112}
        value={String(props.rate)}
        disabled={props.busy}
        options={rateOptions}
        onChange={changeRate}
      />
      <ProductSelect<'speed' | 'mute'>
        menuClassName="sniptale-parameter-menu"
        aria-label={translate('gallery.videoReview.speedAudio')}
        controlSize="sm"
        className={`${reviewTextButtonClassName} !min-w-0 !py-0 !font-normal`}
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

/** Export settings and destination actions share one inspector scroll body. */
export function ReviewEditActions(props: {
  available: boolean;
  hasEdits: boolean;
  busy: boolean;
  phase: 'idle' | 'exporting' | 'publishing';
  progress: number;
  timeEstimate?: VideoProjectExportTimeEstimate | null;
  failed: boolean;
  hasResult: boolean;
  completion?: ReturnType<typeof import('./use-export').useReviewExport>['completion'];
  onOpenResult?: (mediaId: string) => void;
  settings?: ReactNode;
  fragmentAction?: ReactNode;
  audioUnavailable?: boolean;
  advancedBlockers?: readonly QuickEditExportReason[] | null;
  cameraConflicts?: readonly QuickEditCameraConflict[];
  onExport(): void;
  onCancel(): void;
  onDownload(): void;
}) {
  const running = props.phase !== 'idle';
  const completion = !running && !props.failed ? props.completion : null;
  const displayedProgress = completion || props.phase === 'publishing' ? 100 : props.progress;
  const hasBlockers = !!props.advancedBlockers?.length;
  // A local loading failure may be retried explicitly; the writer revalidates before publication.
  const blocked = !!props.advancedBlockers?.some((reason) => reason !== 'action-audio-resource');
  const actionDivider = props.settings
    ? 'border-t border-[var(--sniptale-color-border-soft)] pt-2'
    : '';
  return (
    <div className="space-y-2">
      {running || completion ? (
        <div
          className={`sticky top-0 z-10 space-y-1 py-2
            bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]
            ${props.settings ? 'border-b border-[var(--sniptale-color-border-soft)]' : ''}`}
          data-ui="gallery.videoReview.exportProgress"
        >
          <div className="flex items-center justify-between gap-2 text-xs" role="status">
            <span>
              {props.phase === 'publishing'
                ? translate('gallery.videoReview.publishing')
                : `${translate('gallery.videoReview.exporting')} ${displayedProgress}%`}
            </span>
            {completion ? (
              <span>{translate('gallery.videoReview.exportFinished')}</span>
            ) : props.phase === 'exporting' ? (
              <ReviewButton
                label={translate('gallery.videoReview.cancelExport')}
                className={reviewTextButtonClassName}
                onClick={props.onCancel}
              />
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label={translate('gallery.videoReview.exporting')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayedProgress}
            className="h-1 overflow-hidden rounded-sm bg-[var(--sniptale-color-border-soft)]"
          >
            <div
              className="h-full bg-[var(--sniptale-color-accent)]"
              style={{ width: `${displayedProgress}%` }}
            />
          </div>
          {completion ? (
            <div className="space-y-1 text-xs" role="status">
              <p>
                {translate(
                  completion.destination === 'gallery'
                    ? 'gallery.videoReview.exportAdded'
                    : 'gallery.videoReview.exportCompleted'
                )}
              </p>
              {completion.mediaId && props.onOpenResult ? (
                <ReviewButton
                  label={translate('gallery.videoReview.openExportInLibrary')}
                  className={`${reviewTextButtonClassName} !h-auto !min-h-0 !px-0 text-xs underline underline-offset-2`}
                  onClick={() => props.onOpenResult?.(completion.mediaId!)}
                />
              ) : null}
            </div>
          ) : (
            <VideoExportTimeHint
              estimate={props.timeEstimate}
              active={props.phase === 'exporting'}
              finishing={props.progress >= 100}
            />
          )}
        </div>
      ) : null}
      {props.settings}
      <div
        data-ui="gallery.videoReview.exportActions"
        className={`grid grid-cols-1 gap-1 ${actionDivider}`}
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
        <ReviewButton
          label={translate('gallery.videoReview.downloadVideo')}
          className={`${reviewTextButtonClassName} !w-full justify-start`}
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
        {props.fragmentAction}
      </div>
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
      {hasBlockers ? (
        <div
          role="status"
          className="space-y-1 text-xs"
          data-ui="gallery.videoReview.exportBlockers"
        >
          {translate('gallery.videoReview.exportAdvancedUnavailable')}{' '}
          {props
            .advancedBlockers!.filter(
              (reason) => reason !== 'camera-follow' || !props.cameraConflicts?.length
            )
            .map((blocker) => translate(REASON_LABEL[blocker]))
            .join(' · ')}
          {props.cameraConflicts?.map((conflict) => (
            <p key={`${conflict.regionId}:${conflict.time}:${conflict.reason}`}>
              {translate('gallery.videoReview.cameraConflictLocation')
                .replace('{start}', formatPreciseTime(conflict.interval.start))
                .replace('{end}', formatPreciseTime(conflict.interval.end))
                .replace('{time}', formatPreciseTime(conflict.time))}{' '}
              {translate(CAMERA_REASON_LABEL[conflict.reason])}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A range-only download affordance; unavailable or fully removed intervals cannot be exported. */
export function ReviewFragmentAction(props: {
  selection: ReviewAnchor;
  snapToKeyframes?: boolean;
  showLabel?: boolean;
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
      label={translate(
        props.showLabel
          ? 'gallery.videoReview.exportSelection'
          : 'gallery.videoReview.downloadSelection'
      )}
      toolbarLabel={props.showLabel ? undefined : translate('gallery.videoReview.toolbarFragment')}
      title={rangeLabel + hint}
      disabled={!fragment || props.busy || audioUnavailable}
      className={props.showLabel ? `${reviewTextButtonClassName} !w-full justify-start` : plain}
      onClick={() => props.onDownload(selection)}
    >
      <Download size={16} />
      {props.showLabel ? <span>{translate('gallery.videoReview.exportSelection')}</span> : null}
    </ReviewButton>
  );
}

/** Output choices remain reachable when a selected encoder is unavailable. */
export function ReviewRenderOptions({
  exporter,
  busy,
}: {
  exporter: ReturnType<typeof import('./use-export').useReviewExport>;
  busy: boolean;
}) {
  const { setSizeEstimateVisible } = exporter;
  useEffect(() => {
    setSizeEstimateVisible?.(!busy);
    return () => setSizeEstimateVisible?.(false);
  }, [setSizeEstimateVisible, busy]);
  if (!exporter.index || !exporter.renderSettings) return null;
  const settings = exporter.renderSettings;
  const format = settings.format ?? exporter.index.container;
  const encodedCodecs = reviewOutputCodecs(exporter.index, format);
  const sourceCodec = exporter.index.videoCodec;
  const codecs =
    exporter.sourceVideoAvailable &&
    settings.quality === undefined &&
    format === exporter.index.container &&
    !encodedCodecs.some((codec) => codec === sourceCodec)
      ? [sourceCodec, ...encodedCodecs]
      : encodedCodecs;
  const currentPlan = exporter.plan();
  const copying = currentPlan.kind === 'ready' && currentPlan.video === 'copy';
  return (
    <div className="min-w-0 max-w-full text-xs" data-ui="gallery.videoReview.exportSettings">
      <fieldset disabled={busy} className="review-inspector-columns pb-2">
        <div className="min-w-0 sniptale-parameter-stack">
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('videoEditor.exportDialog.formatLabel')}
            disabled={busy}
            value={format}
            options={(['mp4', 'webm'] as const).map((value) => ({
              value,
              label: value === 'mp4' ? 'MP4' : 'WebM',
              disabled:
                value !== exporter.index!.container &&
                reviewOutputCodecs(exporter.index!, value).length === 0,
            }))}
            onChange={(format) => {
              if (format === exporter.index!.container && settings.quality === undefined) {
                const { codec: _previous, ...sourceSettings } = settings;
                exporter.setRenderSettings({ ...sourceSettings, format });
                return;
              }
              const codec = reviewOutputCodecs(exporter.index!, format)[0];
              if (codec) exporter.setRenderSettings({ ...settings, format, codec });
            }}
          />
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('gallery.videoReview.exportCodec')}
            disabled={busy}
            value={settings.codec ?? (copying ? sourceCodec : codecs[0]) ?? ''}
            options={codecs.map((codec) => ({
              value: codec,
              label:
                codec === 'avc' ? 'H.264' : codec === 'hevc' ? 'H.265 / HEVC' : codec.toUpperCase(),
            }))}
            onChange={(codec) => {
              if (codec === 'av1') {
                const { codec: _previous, ...sourceSettings } = settings;
                exporter.setRenderSettings(sourceSettings);
              } else exporter.setRenderSettings({ ...settings, codec });
            }}
          />
        </div>
        <div className="min-w-0 sniptale-parameter-stack">
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('videoEditor.exportDialog.resolutionLabel')}
            disabled={busy}
            value={settings.resolution ?? VideoResolutionPreset.SOURCE}
            options={Object.values(VideoResolutionPreset).map((value) => ({
              value,
              label:
                value === VideoResolutionPreset.SOURCE
                  ? translate('gallery.videoReview.exportSceneSize')
                  : value.toLowerCase(),
            }))}
            onChange={(resolution) => exporter.setRenderSettings({ ...settings, resolution })}
          />
          <div title={translate('videoEditor.exportDialog.frameRateAdaptiveHint')}>
            <SelectField
              className={reviewSelectFieldClassName}
              label={translate('gallery.videoReview.exportFrameRate')}
              disabled={busy}
              value={
                settings.frameRateMode === 'adaptive' ? 'adaptive' : String(settings.frameRate)
              }
              options={[
                { value: '0', label: translate('gallery.videoReview.exportSourceRate') },
                {
                  value: 'adaptive',
                  label: translate('videoEditor.exportDialog.frameRateAdaptive'),
                },
                ...[24, 30, 60].map((fps) => ({ value: String(fps), label: String(fps) })),
              ]}
              onChange={(value) => {
                if (value === 'adaptive') {
                  exporter.setRenderSettings({
                    ...settings,
                    frameRate: 60,
                    frameRateMode: 'adaptive',
                  });
                  return;
                }
                const frameRate = Number(value);
                if (frameRate === 0 || frameRate === 24 || frameRate === 30 || frameRate === 60)
                  exporter.setRenderSettings({ ...settings, frameRate, frameRateMode: 'constant' });
              }}
            />
          </div>
          <SelectField<VideoQuality | 'source'>
            className={reviewSelectFieldClassName}
            label={translate('gallery.videoReview.exportQuality')}
            disabled={busy}
            value={settings.quality ?? (copying ? 'source' : 'HIGH')}
            options={[
              {
                value: 'source',
                label: translate('gallery.videoReview.exportSourceVideo'),
                disabled: !exporter.sourceVideoAvailable,
              },
              { value: 'LOW', label: translate('videoEditor.exportDialog.qualityLow') },
              { value: 'MEDIUM', label: translate('videoEditor.exportDialog.qualityMedium') },
              { value: 'HIGH', label: translate('videoEditor.exportDialog.qualityHigh') },
              { value: 'ULTRA', label: translate('videoEditor.exportDialog.qualityUltra') },
            ]}
            onChange={(quality) => {
              if (quality === 'source') {
                const { quality: _previous, ...sourceSettings } = settings;
                exporter.setRenderSettings(sourceSettings);
              } else exporter.setRenderSettings({ ...settings, quality });
            }}
          />
        </div>
      </fieldset>
      {exporter.presentationDuration && exporter.hasBookends && (
        <ReviewPresentationDuration plan={exporter.presentationDuration} />
      )}
      <VideoExportSizeHint status={exporter.sizeEstimate ?? null} />
    </div>
  );
}

/** Read-only sequence timing is separate from codec and export-option edits. */
function ReviewPresentationDuration({
  plan,
}: {
  plan: NonNullable<
    ReturnType<typeof import('./use-export').useReviewExport>['presentationDuration']
  >;
}) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2"
      data-ui="gallery.videoReview.exportDuration"
    >
      <span className="text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.videoReview.presentationTotal')}
      </span>
      <span className="tabular-nums">{reviewTimeLabel(plan.totalDurationUs / 1_000_000)}</span>
      <div className="flex w-full flex-wrap gap-x-2 gap-y-1 text-[var(--sniptale-color-text-secondary)]">
        {plan.segments.map((segment) => (
          <span key={segment.name}>
            {translate(
              segment.name === 'intro'
                ? 'gallery.videoReview.presentationIntro'
                : segment.name === 'outro'
                  ? 'gallery.videoReview.presentationOutro'
                  : 'gallery.videoReview.presentationMain'
            )}{' '}
            {reviewTimeLabel((segment.endUs - segment.startUs) / 1_000_000)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Export control strip: one presentation owner for phase, progress, and blocker hints. */
export function ReviewInspectorActions({
  exporter,
  advanced,
  hasEdits,
  busy,
  composerBusy,
  onExport,
  onOpenResult,
  toolKey,
  fragmentAction,
}: {
  exporter: Parameters<typeof ReviewRenderOptions>[0]['exporter'];
  advanced: boolean;
  hasEdits: boolean;
  busy: boolean;
  composerBusy: boolean;
  onExport(): void;
  onOpenResult(mediaId: string): void;
  toolKey: string;
  fragmentAction?: ReactNode;
}) {
  const { dismissCompletion } = exporter;
  useEffect(() => () => dismissCompletion(), [dismissCompletion, toolKey]);
  const exportPlan = exporter.plan();
  const checkingCodecs = exporter.checkingCodecs;
  const settings = advanced ? (
    <ReviewRenderOptions
      exporter={exporter}
      busy={busy || composerBusy || checkingCodecs || exporter.phase !== 'idle'}
    />
  ) : null;
  return (
    <>
      <ReviewEditActions
        settings={settings}
        fragmentAction={fragmentAction}
        available={!!exporter.index && exporter.index.boundaries.length >= 2}
        hasEdits={hasEdits}
        busy={busy || composerBusy || checkingCodecs}
        phase={exporter.phase}
        progress={exporter.progress}
        timeEstimate={exporter.timeEstimate}
        failed={exporter.failed}
        hasResult={!!exporter.result}
        completion={exporter.completion}
        onOpenResult={onOpenResult}
        advancedBlockers={
          checkingCodecs
            ? null
            : exportPlan.kind === 'unavailable'
              ? exportPlan.reasons
              : exporter.blocked
        }
        cameraConflicts={exporter.cameraConflicts}
        onExport={onExport}
        onCancel={exporter.cancel}
        onDownload={exporter.download}
      />
    </>
  );
}
