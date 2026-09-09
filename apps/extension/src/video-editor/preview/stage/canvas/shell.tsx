import React from 'react';
import type { PreviewStageAlternateView } from '../types';
import { Expand, Minimize2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n/index';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import { PreviewStageFullscreenTransport, useFullscreenPreviewPan } from './fullscreen';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewFrameRate,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
  VideoEditorPreviewStatus,
} from '../../../contracts/preview-runtime';
import { PreviewStageControls } from './controls';
import { PreviewStageZoomNavigator } from './navigator';

const PREVIEW_STAGE_CONTENT_BOX_CLASS_NAME = 'absolute inset-4 min-h-0';

const STAGE_CONTROL_BUTTON_CLASS_NAME = '!h-9 !w-9 !min-w-9 !px-0';
const STAGE_HEADER_CLASS_NAME = [
  'flex shrink-0 items-center justify-end gap-2 border-b px-3 py-2',
  'border-[color:var(--sniptale-color-border-soft)]',
].join(' ');

export interface PreviewStageShellLayoutProps {
  alternateView?: PreviewStageAlternateView | undefined;
  headerContent?: React.ReactNode;
  headerActions?: React.ReactNode;
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
  onPreviewFrameRateChange?: ((frameRate: VideoEditorPreviewFrameRate) => void) | undefined;
  onPreviewRasterPresetChange?: (preset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange?: (zoom: VideoEditorPreviewZoom) => void;
  onSeek?: (time: number) => void;
  onTogglePlay?: () => void;
  previewMode?: VideoEditorPreviewMode;
  previewPreferencesSaveFailed?: boolean;
  previewFrameRate?: VideoEditorPreviewFrameRate | undefined;
  previewRasterPreset?: VideoEditorPreviewRasterPreset;
  previewZoom?: VideoEditorPreviewZoom;
  previewStatus?: VideoEditorPreviewStatus;
}

type PreviewStageControlSource = Pick<
  PreviewStageShellLayoutProps,
  | 'onPreviewModeChange'
  | 'onPreviewPreferencesRetry'
  | 'onPreviewFrameRateChange'
  | 'onPreviewRasterPresetChange'
  | 'onPreviewZoomChange'
  | 'previewMode'
  | 'previewPreferencesSaveFailed'
  | 'previewFrameRate'
  | 'previewRasterPreset'
  | 'previewZoom'
  | 'previewStatus'
>;

interface ResolvedPreviewStageControls {
  onPreviewModeChange: (mode: VideoEditorPreviewMode) => void;
  onPreviewPreferencesRetry: () => void;
  onPreviewFrameRateChange?: ((frameRate: VideoEditorPreviewFrameRate) => void) | undefined;
  onPreviewRasterPresetChange: (preset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange: (zoom: VideoEditorPreviewZoom) => void;
  previewMode: VideoEditorPreviewMode;
  previewPreferencesSaveFailed: boolean;
  previewFrameRate?: VideoEditorPreviewFrameRate | undefined;
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
    onPreviewFrameRateChange: props.onPreviewFrameRateChange ?? (() => undefined),
    onPreviewRasterPresetChange: props.onPreviewRasterPresetChange ?? (() => undefined),
    onPreviewZoomChange: props.onPreviewZoomChange ?? (() => undefined),
    previewMode: props.previewMode ?? 'live',
    previewPreferencesSaveFailed: props.previewPreferencesSaveFailed ?? false,
    previewFrameRate: props.previewFrameRate ?? 'project',
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
      dataUi="video-editor.preview.fullscreen-toggle"
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
    headerContent?: React.ReactNode;
    headerActions?: React.ReactNode;
    alternateActive?: boolean | undefined;
    isFullscreen: boolean;
    onCloseFullscreen?: () => void;
    onOpenFullscreen?: () => void;
  }
) {
  return (
    <div className={STAGE_HEADER_CLASS_NAME} data-ui="video.preview.header">
      <div className="flex min-h-9 min-w-0 flex-1 items-center">
        {props.isFullscreen ? null : props.headerContent}
      </div>
      <div hidden={props.alternateActive}>
        <PreviewStageControls
          mode={props.previewMode}
          onModeChange={props.onPreviewModeChange}
          onPreferencesRetry={props.onPreviewPreferencesRetry}
          onRasterPresetChange={props.onPreviewRasterPresetChange}
          onZoomChange={props.onPreviewZoomChange}
          frameRate={props.previewFrameRate ?? 'project'}
          onFrameRateChange={props.onPreviewFrameRateChange ?? (() => undefined)}
          rasterPreset={props.previewRasterPreset}
          preferencesSaveFailed={props.previewPreferencesSaveFailed}
          zoom={props.previewZoom}
          status={props.previewStatus}
        />
      </div>
      {!props.isFullscreen && props.headerActions}
      <div hidden={props.alternateActive}>
        <PreviewStageFullscreenButton {...props} />
      </div>
    </div>
  );
}

type StageShellMainPaneProps = Pick<
  PreviewStageShellLayoutProps,
  | 'children'
  | 'headerContent'
  | 'headerActions'
  | 'alternateView'
  | 'currentTime'
  | 'duration'
  | 'isFullscreen'
  | 'isPlaying'
  | 'playbackRange'
  | 'onCloseFullscreen'
  | 'onOpenFullscreen'
  | 'onPreviewModeChange'
  | 'onPreviewPreferencesRetry'
  | 'onPreviewFrameRateChange'
  | 'onPreviewRasterPresetChange'
  | 'onPreviewZoomChange'
  | 'onSeek'
  | 'onTogglePlay'
  | 'previewMode'
  | 'previewPreferencesSaveFailed'
  | 'previewFrameRate'
  | 'previewRasterPreset'
  | 'previewZoom'
  | 'previewStatus'
>;

function StageShellMainPane(props: StageShellMainPaneProps) {
  const [fullscreenZoom, setFullscreenZoom] = React.useState(1);
  React.useEffect(() => {
    if (!props.isFullscreen) setFullscreenZoom(1);
  }, [props.isFullscreen]);
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${props.isFullscreen ? 'gap-2 p-3' : ''}`}
    >
      {!props.isFullscreen && (
        <PreviewStageShellControls
          headerContent={props.headerContent}
          headerActions={props.headerActions}
          alternateActive={props.alternateView?.active}
          {...resolvePreviewStageControls(props)}
          isFullscreen={props.isFullscreen}
          {...(props.onCloseFullscreen ? { onCloseFullscreen: props.onCloseFullscreen } : {})}
          {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <div className="relative h-full" hidden={props.alternateView?.active}>
          <PreviewStageContent
            previewZoom={props.previewZoom ?? 'fit'}
            fullscreen={props.isFullscreen}
            fullscreenZoom={fullscreenZoom}
          >
            {props.children}
          </PreviewStageContent>
        </div>
        {props.alternateView ? (
          <div className="absolute inset-0" hidden={!props.alternateView.active}>
            {props.alternateView.content}
          </div>
        ) : null}
      </div>
      <StageShellFullscreenTransport
        {...props}
        zoom={fullscreenZoom}
        onZoomChange={setFullscreenZoom}
      />
    </div>
  );
}

function PreviewStageContent(props: {
  children: React.ReactNode;
  previewZoom: VideoEditorPreviewZoom;
  fullscreen: boolean;
  fullscreenZoom: number;
}) {
  const fit = props.fullscreen || props.previewZoom === 'fit';
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const pan = useFullscreenPreviewPan(viewportRef, props.fullscreenZoom, props.fullscreen);
  return (
    <div
      className={
        props.fullscreen
          ? 'absolute inset-0 min-h-0 overflow-hidden rounded-lg bg-black'
          : PREVIEW_STAGE_CONTENT_BOX_CLASS_NAME
      }
    >
      <div
        ref={viewportRef}
        {...pan.handlers}
        style={{ touchAction: props.fullscreen && props.fullscreenZoom > 1 ? 'none' : undefined }}
        className={[
          'h-full w-full [container-type:size]',
          props.fullscreen || !fit ? 'overflow-auto' : 'overflow-hidden',
          props.fullscreen && props.fullscreenZoom > 1
            ? pan.dragging
              ? '!cursor-grabbing [&_*]:!cursor-grabbing'
              : '!cursor-grab [&_*]:!cursor-grab'
            : '',
        ].join(' ')}
        data-ui="video.preview.viewport"
      >
        <div
          ref={contentRef}
          style={
            props.fullscreen
              ? {
                  width: `${props.fullscreenZoom * 100}%`,
                  height: `${props.fullscreenZoom * 100}%`,
                  containerType: 'size',
                }
              : undefined
          }
          className={
            props.fullscreen
              ? 'relative flex items-center justify-center'
              : fit
                ? 'flex h-full w-full items-center justify-center'
                : 'flex min-h-full min-w-full'
          }
        >
          {props.children}
        </div>
      </div>
      {fit ? null : <PreviewStageZoomNavigator contentRef={contentRef} viewportRef={viewportRef} />}
    </div>
  );
}

function StageShellFullscreenTransport(
  props: PreviewStageShellLayoutProps & { zoom: number; onZoomChange: (zoom: number) => void }
) {
  return props.isFullscreen ? (
    <PreviewStageFullscreenTransport
      zoom={props.zoom}
      onZoomChange={props.onZoomChange}
      isPreparing={
        props.previewStatus?.phase === 'preparing-frame-cache' ||
        props.previewStatus?.phase === 'preparing-video-cache'
      }
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
