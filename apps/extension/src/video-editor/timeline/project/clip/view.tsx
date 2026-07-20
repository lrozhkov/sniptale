import type React from 'react';

import { translate } from '../../../../platform/i18n';
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
      className={viewModel.clipClassName}
      style={{ ...viewModel.style, left: viewModel.left, width: viewModel.width }}
      onClick={(event) => selectTimelineClip(event, clip.id, onSelectClip)}
      onPointerEnter={() => onClipHoverChange(clip.id)}
      onPointerLeave={() => onClipHoverChange(null)}
      onPointerDown={(event) => {
        selectTimelineClip(event, clip.id, onSelectClip);
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
  tileWidth,
}: {
  preview: TimelineClipPreview | undefined;
  tileWidth: number;
}) {
  const urls = preview?.urls ?? [];

  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex gap-1 overflow-hidden opacity-90">
      {urls.map((url, index) => (
        <img
          key={`${url}:${index}`}
          src={url}
          alt=""
          aria-hidden="true"
          className="h-full shrink-0 object-cover"
          style={{ width: tileWidth }}
          draggable={false}
        />
      ))}
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
      <ProjectTimelineCrossfadeOverlay
        align="left"
        title={viewModel.incomingCrossfadeTitle}
        visible={viewModel.hasIncomingCrossfade}
        width={viewModel.incomingCrossfadeOverlayWidth}
      />
      <ProjectTimelineCrossfadeOverlay
        align="right"
        title={viewModel.outgoingCrossfadeTitle}
        visible={viewModel.hasOutgoingCrossfade}
        width={viewModel.outgoingCrossfadeOverlayWidth}
      />
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
  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      className={className}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => !disabled && onBeginClipInteraction(event, clip, mode)}
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

function ProjectTimelineCrossfadeOverlay({
  align,
  title,
  visible,
  width,
}: {
  align: 'left' | 'right';
  title: string;
  visible: boolean;
  width: number;
}) {
  if (!visible || width <= 0) {
    return null;
  }

  return (
    <div
      title={title}
      className={[
        `pointer-events-none absolute inset-y-0 ${align}-0`,
        align === 'left' ? 'bg-gradient-to-r' : 'bg-gradient-to-l',
        'from-[color:color-mix(in_srgb,#7c3aed_26%,transparent)]',
        'via-[color:color-mix(in_srgb,#7c3aed_12%,transparent)]',
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
      className="pointer-events-none absolute inset-y-0 z-10 flex min-w-0 items-center gap-2 overflow-hidden"
      data-project-timeline-clip-label={clip.id}
      style={viewModel.labelStyle}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
      </div>
    </div>
  );
}
