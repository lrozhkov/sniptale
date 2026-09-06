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
      <ProjectTimelineTrimHandle
        className={`${viewModel.trimHandleClassName} left-0`}
        clip={clip}
        disabled={trackLocked}
        mode="trim-start"
        onBeginClipInteraction={onBeginClipInteraction}
      />
      <ProjectTimelineTrimHandle
        className={`${viewModel.trimHandleClassName} right-0`}
        clip={clip}
        disabled={trackLocked}
        mode="trim-end"
        onBeginClipInteraction={onBeginClipInteraction}
      />
      {shouldRenderVisualPreview ? (
        <ProjectTimelineVisualClipPreview
          preview={preview}
          clip={clip}
          width={viewModel.width}
          tileWidth={viewModel.previewTileWidth}
        />
      ) : viewModel.waveformPeaks.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-2 inset-y-2 overflow-hidden rounded-[12px]">
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
}: {
  preview: TimelineClipPreview | undefined;
  clip: VideoProjectClip;
  width: number;
  tileWidth: number;
}) {
  if (!preview || tileWidth === 0 || clip.duration <= 0) return null;
  const rate =
    clip.type === VideoProjectClipType.VIDEO
      ? normalizeClipPlaybackRate(clip.playbackRate ?? 1)
      : 1;
  const sourceStart = clip.type === VideoProjectClipType.VIDEO ? clip.sourceStart : 0;
  const frames =
    preview.kind === 'video'
      ? preview.frames
      : [{ url: preview.url, sourceStart: 0, sourceEnd: clip.duration }];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 top-5 z-0 overflow-hidden opacity-90">
      {frames.map((frame) => {
        const start = Math.max(0, (frame.sourceStart - sourceStart) / rate);
        const end = Math.min(clip.duration, (frame.sourceEnd - sourceStart) / rate);
        const firstCell = Math.ceil(((start / clip.duration) * width) / tileWidth);
        const lastCell = Math.ceil(((end / clip.duration) * width) / tileWidth);
        const left = firstCell * tileWidth;
        const right = Math.min(width, lastCell * tileWidth);
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
        align="left"
        title={translate('videoEditor.sidebar.fadeInLabel')}
        width={viewModel.fadeInOverlayWidth}
      />
      <ProjectTimelineFadeOverlay
        align="right"
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
  align,
  title,
  width,
}: {
  align: 'left' | 'right';
  title: string;
  width: number;
}) {
  if (width <= 0) {
    return null;
  }

  return (
    <div
      title={title}
      className={[
        `pointer-events-none absolute inset-y-0 ${align}-0 z-0`,
        align === 'left' ? 'bg-gradient-to-r' : 'bg-gradient-to-l',
        'from-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_58%,transparent)]',
        'via-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_24%,transparent)]',
        'to-transparent',
      ].join(' ')}
      style={{ width }}
    />
  );
}

function ProjectTimelineClipLabel({
  clip,
  project,
  viewModel,
}: Pick<ProjectTimelineClipLayoutProps, 'clip' | 'project' | 'viewModel'>) {
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
