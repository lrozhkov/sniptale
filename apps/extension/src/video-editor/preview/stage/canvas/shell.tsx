import React from 'react';
import { Expand, Minimize2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n/index';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import { PreviewStageFullscreenTransport } from './fullscreen';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
  VideoEditorPreviewStatus,
} from '../../../contracts/preview-runtime';
import { PreviewStageControls } from './controls';

const PREVIEW_STAGE_CONTENT_BOX_CLASS_NAME = 'absolute inset-4 min-h-0';

const STAGE_CONTROL_BUTTON_CLASS_NAME = '!h-9 !w-9 !min-w-9 !px-0';
const STAGE_OVERLAY_CONTROLS_CLASS_NAME = [
  'pointer-events-none absolute right-4 top-4 z-20 flex',
  'max-w-[calc(100%-2rem)] flex-nowrap items-center justify-end gap-2',
].join(' ');

export interface PreviewStageShellLayoutProps {
  children: React.ReactNode;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  isPlaying: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  onCloseFullscreen?: () => void;
  onOpenFullscreen?: () => void;
  onPreviewModeChange?: (mode: VideoEditorPreviewMode) => void;
  onPreviewPreferencesRetry?: () => void;
  onPreviewRasterPresetChange?: (preset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange?: (zoom: VideoEditorPreviewZoom) => void;
  onSeek?: (time: number) => void;
  onTogglePlay?: () => void;
  previewMode?: VideoEditorPreviewMode;
  previewPreferencesSaveFailed?: boolean;
  previewRasterPreset?: VideoEditorPreviewRasterPreset;
  previewZoom?: VideoEditorPreviewZoom;
  previewStatus?: VideoEditorPreviewStatus;
}

type PreviewStageControlSource = Pick<
  PreviewStageShellLayoutProps,
  | 'onPreviewModeChange'
  | 'onPreviewPreferencesRetry'
  | 'onPreviewRasterPresetChange'
  | 'onPreviewZoomChange'
  | 'previewMode'
  | 'previewPreferencesSaveFailed'
  | 'previewRasterPreset'
  | 'previewZoom'
  | 'previewStatus'
>;

interface ResolvedPreviewStageControls {
  onPreviewModeChange: (mode: VideoEditorPreviewMode) => void;
  onPreviewPreferencesRetry: () => void;
  onPreviewRasterPresetChange: (preset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange: (zoom: VideoEditorPreviewZoom) => void;
  previewMode: VideoEditorPreviewMode;
  previewPreferencesSaveFailed: boolean;
  previewRasterPreset: VideoEditorPreviewRasterPreset;
  previewZoom: VideoEditorPreviewZoom;
  previewStatus: VideoEditorPreviewStatus;
}

export function resolvePreviewStageControls(
  props: PreviewStageControlSource
): ResolvedPreviewStageControls {
  return {
    onPreviewModeChange: props.onPreviewModeChange ?? (() => undefined),
    onPreviewPreferencesRetry: props.onPreviewPreferencesRetry ?? (() => undefined),
    onPreviewRasterPresetChange: props.onPreviewRasterPresetChange ?? (() => undefined),
    onPreviewZoomChange: props.onPreviewZoomChange ?? (() => undefined),
    previewMode: props.previewMode ?? 'live',
    previewPreferencesSaveFailed: props.previewPreferencesSaveFailed ?? false,
    previewRasterPreset: props.previewRasterPreset ?? '720p',
    previewZoom: props.previewZoom ?? 'fit',
    previewStatus: props.previewStatus ?? {
      completedFrames: 0,
      mode: props.previewMode ?? 'live',
      phase: 'idle',
      totalFrames: 0,
    },
  };
}

function StageShellActionButton(props: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <ContentToolbarButton
      type="button"
      title={props.title}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      className={STAGE_CONTROL_BUTTON_CLASS_NAME}
    >
      {props.icon}
    </ContentToolbarButton>
  );
}

function PreviewStageFullscreenButton(props: {
  isFullscreen: boolean;
  onCloseFullscreen?: () => void;
  onOpenFullscreen?: () => void;
}) {
  return (
    <div className="pointer-events-auto">
      <StageShellActionButton
        icon={
          props.isFullscreen ? (
            <Minimize2 size={16} strokeWidth={2} />
          ) : (
            <Expand size={16} strokeWidth={2} />
          )
        }
        title={
          props.isFullscreen
            ? translate('videoEditor.stage.exitFullscreen')
            : translate('videoEditor.stage.enterFullscreen')
        }
        onClick={
          props.isFullscreen
            ? (props.onCloseFullscreen ?? (() => undefined))
            : (props.onOpenFullscreen ?? (() => undefined))
        }
      />
    </div>
  );
}

function PreviewStageShellControls(
  props: ResolvedPreviewStageControls & {
    isFullscreen: boolean;
    onCloseFullscreen?: () => void;
    onOpenFullscreen?: () => void;
  }
) {
  return (
    <div className={STAGE_OVERLAY_CONTROLS_CLASS_NAME}>
      <PreviewStageControls
        mode={props.previewMode}
        onModeChange={props.onPreviewModeChange}
        onPreferencesRetry={props.onPreviewPreferencesRetry}
        onRasterPresetChange={props.onPreviewRasterPresetChange}
        onZoomChange={props.onPreviewZoomChange}
        rasterPreset={props.previewRasterPreset}
        preferencesSaveFailed={props.previewPreferencesSaveFailed}
        zoom={props.previewZoom}
        status={props.previewStatus}
      />
      <PreviewStageFullscreenButton {...props} />
    </div>
  );
}

type StageShellMainPaneProps = Pick<
  PreviewStageShellLayoutProps,
  | 'children'
  | 'currentTime'
  | 'duration'
  | 'isFullscreen'
  | 'isPlaying'
  | 'playbackRange'
  | 'onCloseFullscreen'
  | 'onOpenFullscreen'
  | 'onPreviewModeChange'
  | 'onPreviewPreferencesRetry'
  | 'onPreviewRasterPresetChange'
  | 'onPreviewZoomChange'
  | 'onSeek'
  | 'onTogglePlay'
  | 'previewMode'
  | 'previewPreferencesSaveFailed'
  | 'previewRasterPreset'
  | 'previewZoom'
  | 'previewStatus'
>;

function StageShellMainPane(props: StageShellMainPaneProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <PreviewStageShellControls
        {...resolvePreviewStageControls(props)}
        isFullscreen={props.isFullscreen}
        {...(props.onCloseFullscreen ? { onCloseFullscreen: props.onCloseFullscreen } : {})}
        {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
      />
      <PreviewStageContent previewZoom={props.previewZoom ?? 'fit'}>
        {props.children}
      </PreviewStageContent>
      <StageShellFullscreenTransport {...props} />
    </div>
  );
}

function PreviewStageContent(props: {
  children: React.ReactNode;
  previewZoom: VideoEditorPreviewZoom;
}) {
  const fit = props.previewZoom === 'fit';
  return (
    <div className={PREVIEW_STAGE_CONTENT_BOX_CLASS_NAME}>
      <div
        className={`h-full w-full [container-type:size] ${fit ? 'overflow-hidden' : 'overflow-auto'}`}
        data-ui="video.preview.viewport"
      >
        <div
          className={
            fit ? 'flex h-full w-full items-center justify-center' : 'flex min-h-full min-w-full'
          }
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}

function StageShellFullscreenTransport(props: PreviewStageShellLayoutProps) {
  return props.isFullscreen ? (
    <PreviewStageFullscreenTransport
      currentTime={props.currentTime}
      duration={props.duration}
      isPlaying={props.isPlaying}
      playbackRange={props.playbackRange}
      onClose={props.onCloseFullscreen ?? (() => undefined)}
      onSeek={props.onSeek ?? (() => undefined)}
      onTogglePlay={props.onTogglePlay ?? (() => undefined)}
    />
  ) : null;
}

export function PreviewStageShellLayout(props: PreviewStageShellLayoutProps) {
  return <StageShellMainPane {...props} />;
}
