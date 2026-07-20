import { CompactSelect } from '../../../../ui/compact-inspector-controls/select';
import { translate } from '../../../../platform/i18n';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
  VideoEditorPreviewStatus,
} from '../../../contracts/preview-runtime';

interface PreviewStageControlsProps {
  mode: VideoEditorPreviewMode;
  onModeChange: (mode: VideoEditorPreviewMode) => void;
  onPreferencesRetry: () => void;
  onRasterPresetChange: (preset: VideoEditorPreviewRasterPreset) => void;
  onZoomChange: (zoom: VideoEditorPreviewZoom) => void;
  rasterPreset: VideoEditorPreviewRasterPreset;
  preferencesSaveFailed: boolean;
  zoom: VideoEditorPreviewZoom;
  status: VideoEditorPreviewStatus;
}

const CONTROL_CLASS_NAME = '!h-9 !min-w-20 !bg-[color:var(--sniptale-color-surface-panel)]';
const RETRY_CLASS_NAME = [
  'h-9 rounded-[8px] border px-2 text-[11px] font-semibold',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_38%,var(--sniptale-color-border-soft)_62%)]',
  'bg-[color:var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-danger)]',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');
const STATUS_CLASS_NAME = [
  'max-w-44 truncate rounded-[8px] border px-2 py-1 text-[11px] font-semibold',
  'border-[color:var(--sniptale-color-border-soft)] bg-[color:var(--sniptale-color-surface-panel)]',
  'text-[color:var(--sniptale-color-text-muted)]',
].join(' ');

export function PreviewStageControls(props: PreviewStageControlsProps) {
  return (
    <div
      className="pointer-events-auto relative flex flex-nowrap items-center justify-end gap-2"
      data-ui="video.preview.controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <PreviewModeControl {...props} />
      {props.mode === 'cache' ? (
        <div className="absolute right-0 top-11">
          <PreviewCacheStatus status={props.status} />
        </div>
      ) : null}
      <PreviewPreferencesRetry {...props} />
      <CompactSelect
        aria-label={translate('videoEditor.stage.previewRaster')}
        className={CONTROL_CLASS_NAME}
        containerClassName="!w-[88px]"
        onChange={props.onRasterPresetChange}
        options={['360p', '540p', '720p', '1080p', '1440p', '2160p'].map((value) => ({
          label: value,
          value: value as VideoEditorPreviewRasterPreset,
        }))}
        value={props.rasterPreset}
      />
      <CompactSelect
        aria-label={translate('videoEditor.stage.previewZoom')}
        className={CONTROL_CLASS_NAME}
        containerClassName="!w-[88px]"
        onChange={props.onZoomChange}
        options={[
          { label: translate('videoEditor.stage.previewZoomFit'), value: 'fit' },
          { label: '75%', value: '75%' },
          { label: '100%', value: '100%' },
        ]}
        value={props.zoom}
      />
    </div>
  );
}

function PreviewModeControl(props: PreviewStageControlsProps) {
  return (
    <CompactSelect
      aria-label={translate('videoEditor.stage.previewMode')}
      className={CONTROL_CLASS_NAME}
      containerClassName="!w-[92px]"
      onChange={props.onModeChange}
      options={[
        { label: translate('videoEditor.stage.previewModeLive'), value: 'live' },
        { label: translate('videoEditor.stage.previewModeCache'), value: 'cache' },
      ]}
      title={translate('videoEditor.stage.previewCacheRetentionDisclosure')}
      value={props.mode}
    />
  );
}

function PreviewPreferencesRetry(props: PreviewStageControlsProps) {
  return props.preferencesSaveFailed ? (
    <button type="button" className={RETRY_CLASS_NAME} onClick={props.onPreferencesRetry}>
      {translate('videoEditor.stage.previewPreferencesRetry')}
    </button>
  ) : null;
}

function PreviewCacheStatus({ status }: { status: VideoEditorPreviewStatus }) {
  const isPreparing =
    status.phase === 'preparing-frame-cache' || status.phase === 'preparing-video-cache';
  const label =
    status.outcome === 'capacity-limited'
      ? translate('videoEditor.stage.previewCacheCapacityLimited')
      : status.outcome === 'failed'
        ? translate('videoEditor.stage.previewCacheFailed')
        : status.outcome === 'unavailable'
          ? translate('videoEditor.stage.previewCacheUnavailable')
          : isPreparing
            ? `${translate('videoEditor.stage.previewCachePreparing')} ${status.completedFrames}/${status.totalFrames}`
            : status.phase === 'cached-frame-playback' || status.phase === 'cached-video-playback'
              ? translate('videoEditor.stage.previewCacheReady')
              : status.phase === 'paused-preparation'
                ? translate('videoEditor.stage.previewCachePaused')
                : status.phase === 'recovering'
                  ? translate('videoEditor.stage.previewCacheUnavailable')
                  : null;
  return label ? <span className={STATUS_CLASS_NAME}>{label}</span> : null;
}
