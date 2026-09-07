import type React from 'react';

import { translate } from '../../../../platform/i18n';
import { normalizeClipPlaybackRate } from '../../../../features/video/project/timeline/basics';
import { buildClipLabel } from '../../../../features/video/project/timeline';
import { VideoProjectClipType } from '../../../../features/video/project/types';
import type { VideoProjectClip } from '../../../../features/video/project/types';
import { AudioClipWaveform } from './waveform';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../canvas/hover-preview';
import type { TimelineClipPreview } from '../../../contracts/timeline-preview';
import type { DragMode } from '../types';
import type { ProjectTimelineClipLayoutProps, ProjectTimelineClipProps } from './types';

function selectTimelineClip(
  event: Pick<React.SyntheticEvent, 'stopPropagation'>,
  clipId: string,
  onSelectClip: ProjectTimelineClipProps['onSelectClip']
) {
  event.stopPropagation();
  onSelectClip(clipId);
}

export function ProjectTimelineClipLayout({
  clip,
  preview,
  project,
  trackLocked,
  viewModel,
  onClipHoverChange,
  onSelectClip,
  onBeginClipInteraction,
}: ProjectTimelineClipLayoutProps) {
  if (!viewModel.visible) return null;
  return (
    <div
      {...TIMELINE_OBJECT_MARKER_PROPS}
      data-project-timeline-clip={clip.id}
      title={clip.name?.trim() || buildClipLabel(project, clip)}
      className={viewModel.clipClassName}
      style={{ ...viewModel.style, left: viewModel.left, width: viewModel.width }}
      onClick={(event) => selectTimelineClip(event, clip.id, onSelectClip)}
      onPointerEnter={() => onClipHoverChange(clip.id)}
      onPointerLeave={() => onClipHoverChange(null)}
      onPointerDownCapture={() => onSelectClip(clip.id)}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!trackLocked) {
          onBeginClipInteraction(event, clip, 'move');
        }
      }}
    >
      <ProjectTimelineClipContent
        clip={clip}
        {...(preview ? { preview } : {})}
        project={project}
        trackLocked={trackLocked}
        viewModel={viewModel}
        onBeginClipInteraction={onBeginClipInteraction}
      />
    </div>
  );
}

function ProjectTimelineClipContent({
  clip,
  preview,
  project,
  trackLocked,
  viewModel,
  onBeginClipInteraction,
}: Omit<ProjectTimelineClipLayoutProps, 'onClipHoverChange' | 'onSelectClip'>) {
  const shouldRenderVisualPreview = isVisualPreviewClip(clip);

  return (
    <>
      {viewModel.includesStart ? (
        <ProjectTimelineTrimHandle
          className={`${viewModel.trimHandleClassName} left-0`}
          clip={clip}
          disabled={trackLocked}
          mode="trim-start"
          onBeginClipInteraction={onBeginClipInteraction}
        />
      ) : null}
      {viewModel.includesEnd ? (
        <ProjectTimelineTrimHandle
          className={`${viewModel.trimHandleClassName} right-0`}
          clip={clip}
          disabled={trackLocked}
          mode="trim-end"
          onBeginClipInteraction={onBeginClipInteraction}
        />
      ) : null}
      {shouldRenderVisualPreview ? (
        <ProjectTimelineVisualClipPreview
          preview={preview}
          clip={clip}
          width={viewModel.width}
          tileWidth={viewModel.previewTileWidth}
          offsetSeconds={viewModel.offsetSeconds}
          visibleDuration={viewModel.visibleDuration}
        />
      ) : viewModel.waveformPeaks.length > 0 ? (
        <div
          data-ui="video-editor.timeline.audio-waveform"
          className="pointer-events-none absolute inset-x-2 bottom-0.5 overflow-hidden"
          style={{ top: viewModel.labelHeight + 2 }}
        >
          <AudioClipWaveform
            envelopeEnd={viewModel.waveformEnvelopeEnd}
            envelopeStart={viewModel.waveformEnvelopeStart}
            peaks={viewModel.waveformPeaks}
            muted={clip.muted}
          />
        </div>
      ) : null}
      <ProjectTimelineClipVisualOverlays viewModel={viewModel} />
      <ProjectTimelineClipLabel clip={clip} project={project} viewModel={viewModel} />
      {viewModel.visualEmphasis ? (
        <span
          aria-hidden="true"
          data-ui="video-editor.timeline.clip-contour"
          className={[
            'pointer-events-none absolute inset-y-0 z-40 rounded-sm border-2',
            'border-[var(--sniptale-color-accent-emphasis)]',
          ].join(' ')}
          style={{ left: viewModel.bodyInsetLeft, right: viewModel.bodyInsetRight }}
        />
      ) : null}
    </>
  );
}

function isVisualPreviewClip(clip: VideoProjectClip): boolean {
  return clip.type === VideoProjectClipType.VIDEO || clip.type === VideoProjectClipType.IMAGE;
}

function ProjectTimelineVisualClipPreview({
  preview,
  clip,
  width,
  tileWidth,
  offsetSeconds,
  visibleDuration,
}: {
  preview: TimelineClipPreview | undefined;
  clip: VideoProjectClip;
  width: number;
  tileWidth: number;
  offsetSeconds: number;
  visibleDuration: number;
}) {
  if (!preview || tileWidth === 0 || clip.duration <= 0) return null;
  const rate =
    clip.type === VideoProjectClipType.VIDEO
      ? normalizeClipPlaybackRate(clip.playbackRate ?? 1)
      : 1;
  const sourceStart = clip.type === VideoProjectClipType.VIDEO ? clip.sourceStart : 0;
  const scale = visibleDuration > 0 ? width / visibleDuration : 0;
  const offsetPixels = offsetSeconds * scale;
  const frames =
    preview.kind === 'video'
      ? preview.frames
      : [{ url: preview.url, sourceStart: 0, sourceEnd: clip.duration }];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 top-5 z-0 overflow-hidden opacity-90">
      {frames.map((frame) => {
        const start = Math.max(0, (frame.sourceStart - sourceStart) / rate);
        const end = Math.min(clip.duration, (frame.sourceEnd - sourceStart) / rate);
        const firstCell = Math.ceil((start * scale) / tileWidth);
        const lastCell = Math.ceil((end * scale) / tileWidth);
        const left = Math.max(0, firstCell * tileWidth - offsetPixels);
        const right = Math.min(width, lastCell * tileWidth - offsetPixels);
        if (right <= left) return null;
        return (
          <div
            key={`${frame.sourceStart}:${frame.url}`}
            aria-hidden="true"
            data-timeline-frame-source={frame.sourceStart}
            className="absolute inset-y-0 bg-repeat-x"
            style={{
              left,
              width: right - left,
              backgroundImage: `url(${JSON.stringify(frame.url)})`,
              backgroundSize: 'auto 100%',
              backgroundPositionX: -((offsetPixels + left) % tileWidth),
            }}
          />
        );
      })}
    </div>
  );
}

function ProjectTimelineClipVisualOverlays({
  viewModel,
}: Pick<ProjectTimelineClipLayoutProps, 'viewModel'>) {
  return (
    <>
      <ProjectTimelineFadeOverlay
        style={viewModel.fadeInOverlayStyle}
        title={translate('videoEditor.sidebar.fadeInLabel')}
        width={viewModel.fadeInOverlayWidth}
      />
      <ProjectTimelineFadeOverlay
        style={viewModel.fadeOutOverlayStyle}
        title={translate('videoEditor.sidebar.fadeOutLabel')}
        width={viewModel.fadeOutOverlayWidth}
      />
      {viewModel.bodyInsetLeft > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--sniptale-color-border-strong)]"
          style={{ left: viewModel.bodyInsetLeft }}
        />
      ) : null}
      <span className={`${viewModel.edgeClassName} left-0`} aria-hidden="true" />
      <span className={`${viewModel.edgeClassName} right-0`} aria-hidden="true" />
    </>
  );
}

function ProjectTimelineTrimHandle({
  className,
  clip,
  disabled,
  mode,
  onBeginClipInteraction,
}: {
  className: string;
  clip: VideoProjectClip;
  disabled: boolean;
  mode: DragMode;
  onBeginClipInteraction: ProjectTimelineClipProps['onBeginClipInteraction'];
}) {
  const edgeLabel = translate(
    mode === 'trim-start' ? 'videoEditor.app.sourceInLabel' : 'videoEditor.app.sourceOutLabel'
  );
  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      className={className}
      disabled={disabled}
      tabIndex={-1}
      aria-label={`${clip.name} ${edgeLabel}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!disabled) onBeginClipInteraction(event, clip, mode);
      }}
    />
  );
}

function ProjectTimelineFadeOverlay({
  style,
  title,
  width,
}: {
  style: React.CSSProperties;
  title: string;
  width: number;
}) {
  if (width <= 0) {
    return null;
  }

  return <div title={title} className="pointer-events-none absolute inset-y-0 z-0" style={style} />;
}

function ProjectTimelineClipLabel({
  clip,
  project,
  viewModel,
}: Pick<ProjectTimelineClipLayoutProps, 'clip' | 'project' | 'viewModel'>) {
  if (viewModel.labelHeight === 0) return null;
  const label = clip.name?.trim() || buildClipLabel(project, clip);
  return (
    <div
      className={[
        'pointer-events-none absolute inset-x-0 top-0 z-10 h-5 overflow-hidden',
        'bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary-strong)]',
      ].join(' ')}
      data-project-timeline-clip-label={clip.id}
    >
      <div className="absolute inset-y-0 flex min-w-0 items-center" style={viewModel.labelStyle}>
        <p className="truncate text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}
