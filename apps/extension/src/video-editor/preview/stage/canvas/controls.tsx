import { PreviewDisplaySettings } from './display-settings';
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

const RETRY_CLASS_NAME = [
  'h-9 rounded-[8px] border px-2 text-[11px] font-semibold',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_38%,var(--sniptale-color-border-soft)_62%)]',
  'bg-[color:var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-danger)]',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');
const STATUS_CLASS_NAME = [
  'min-w-0 rounded-[8px] border px-2 py-1 text-[11px] font-semibold',
  'border-[color:var(--sniptale-color-border-soft)] bg-[color:var(--sniptale-color-surface-panel)]',
  'text-[color:var(--sniptale-color-text-muted)]',
].join(' ');

export function PreviewStageControls(props: PreviewStageControlsProps) {
  return (
    <div
      className="pointer-events-auto flex shrink-0 flex-col items-end gap-1"
      data-ui="video.preview.controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <PreviewDisplaySettings {...props} />
      <div
        className="flex max-w-[308px] flex-wrap justify-end gap-1 empty:hidden"
        data-ui="video.preview.feedback"
      >
        {props.mode === 'cache' ? <PreviewCacheStatus status={props.status} /> : null}
        <PreviewPreferencesRetry {...props} />
      </div>
    </div>
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
