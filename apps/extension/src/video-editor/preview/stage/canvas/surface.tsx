import { PreviewFrameRateProvider } from '../frame-rate';
import { resolvePreviewStageSizeStyle } from '../sizing/zoom';
import { PreviewStageCanvas } from './';
import { usePreviewStageFullscreen } from './fullscreen';
import { PreviewStageFrame } from './layout';
import type { PreviewStageSurfaceProps } from '../types';
import React from 'react';
import { PreviewEffectRuntimeError } from './runtime-error';

export function PreviewStageSurface(params: PreviewStageSurfaceProps) {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const { closeFullscreen, isFullscreen, openFullscreen } = usePreviewStageFullscreen(frameRef);

  return (
    <PreviewFrameRateProvider
      enabled={params.previewShowFrameRate ?? false}
      live={params.previewMode === 'live'}
      playing={params.isPlaying && !params.alternateView?.active}
      onChange={params.onPreviewShowFrameRateChange ?? (() => undefined)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <PreviewStageFrame
          alternateView={params.alternateView}
          headerContent={params.headerContent}
          headerActions={params.headerActions}
          currentTime={params.currentTime}
          duration={params.project.duration}
          isFullscreen={isFullscreen}
          isPlaying={params.isPlaying}
          playbackRange={params.playbackRange}
          onCloseFullscreen={closeFullscreen}
          onOpenFullscreen={openFullscreen}
          onPreviewModeChange={params.onPreviewModeChange}
          onPreviewPreferencesRetry={params.onPreviewPreferencesRetry}
          onPreviewRasterPresetChange={params.onPreviewRasterPresetChange}
          onPreviewZoomChange={params.onPreviewZoomChange}
          onSeek={params.onSeek}
          onSelectScene={params.onSelectScene}
          onTogglePlay={params.onTogglePlay}
          previewMode={params.previewMode}
          previewPreferencesSaveFailed={params.previewPreferencesSaveFailed}
          previewFrameRate={params.previewFrameRate}
          onPreviewFrameRateChange={params.onPreviewFrameRateChange}
          previewRasterPreset={params.previewRasterPreset}
          previewZoom={params.previewZoom}
          previewStatus={params.previewStatus}
          ref={frameRef}
        >
          <PreviewStageCanvas
            {...params}
            stageSizeStyle={
              isFullscreen
                ? resolvePreviewStageSizeStyle(params.project, 'fit')
                : params.stageSizeStyle
            }
            mode={isFullscreen ? 'player' : 'editor'}
          />
          {params.effectRuntimeFeedback.failed ? (
            <PreviewEffectRuntimeError onRetry={params.effectRuntimeFeedback.onRetry} />
          ) : null}
        </PreviewStageFrame>
      </div>
    </PreviewFrameRateProvider>
  );
}
