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
    <div className="flex h-full min-h-0 flex-col">
      <PreviewStageFrame
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
        previewRasterPreset={params.previewRasterPreset}
        previewZoom={params.previewZoom}
        previewStatus={params.previewStatus}
        ref={frameRef}
      >
        <PreviewStageCanvas {...params} mode={isFullscreen ? 'player' : 'editor'} />
        {params.effectRuntimeFeedback.failed ? (
          <PreviewEffectRuntimeError onRetry={params.effectRuntimeFeedback.onRetry} />
        ) : null}
      </PreviewStageFrame>
    </div>
  );
}
