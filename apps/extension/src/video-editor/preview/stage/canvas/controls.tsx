import { LoaderCircle, CircleAlert, Pause } from 'lucide-react';
import { PreviewDisplaySettings } from './display-settings';
import { translate } from '../../../../platform/i18n';
import type {
  VideoEditorPreviewFrameRate,
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
  VideoEditorPreviewStatus,
} from '../../../contracts/preview-runtime';

interface PreviewStageControlsProps {
  frameRate?: VideoEditorPreviewFrameRate;
  onFrameRateChange?: (frameRate: VideoEditorPreviewFrameRate) => void;
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

export function PreviewStageControls(props: PreviewStageControlsProps) {
  return (
    <div
      className="pointer-events-auto flex h-9 shrink-0 items-center gap-2"
      data-ui="video.preview.controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="flex h-9 shrink-0 items-center gap-2 empty:hidden"
        data-ui="video.preview.feedback"
      >
        {props.mode === 'cache' ? <PreviewCacheStatus status={props.status} /> : null}
        <PreviewPreferencesRetry {...props} />
      </div>
      <PreviewDisplaySettings {...props} />
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
  const percent = Math.min(
    100,
    Math.round((status.completedFrames / Math.max(1, status.totalFrames)) * 100)
  );
  const label =
    status.outcome === 'capacity-limited'
      ? translate('videoEditor.stage.previewCacheCapacityLimited')
      : status.outcome === 'failed'
        ? translate('videoEditor.stage.previewCacheFailed')
        : status.outcome === 'unavailable'
          ? translate('videoEditor.stage.previewCacheUnavailable')
          : isPreparing
            ? translate('videoEditor.stage.previewCachePreparing')
            : status.phase === 'cached-frame-playback' || status.phase === 'cached-video-playback'
              ? translate('videoEditor.stage.previewCacheReady')
              : status.phase === 'paused-preparation'
                ? translate('videoEditor.stage.previewCachePaused')
                : status.phase === 'recovering'
                  ? translate('videoEditor.stage.previewCacheUnavailable')
                  : null;
  if (!label) return null;
  const ready =
    status.phase === 'cached-frame-playback' || status.phase === 'cached-video-playback';
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="inline-flex h-9 items-center gap-1.5 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]"
    >
      {isPreparing ? (
        <>
          <LoaderCircle
            size={13}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{percent}%</span>
        </>
      ) : ready ? (
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--sniptale-color-success)]" />
      ) : status.phase === 'paused-preparation' ? (
        <Pause size={13} aria-hidden="true" />
      ) : (
        <>
          <CircleAlert
            size={14}
            aria-hidden="true"
            className="text-[var(--sniptale-color-warning)]"
          />
          <span className="whitespace-nowrap">
            {translate(
              status.outcome === 'failed'
                ? 'videoEditor.stage.previewCacheFailedShort'
                : status.outcome === 'capacity-limited'
                  ? 'videoEditor.stage.previewCacheCapacityShort'
                  : 'videoEditor.stage.previewCacheUnavailableShort'
            )}
          </span>
        </>
      )}
    </span>
  );
}
