import { buildProjectTimelineClipViewModel } from './model';
import type { ProjectTimelineClipProps } from './types';
import { ProjectTimelineClipLayout } from './view';

export function ProjectTimelineClip({
  clip,
  isHovered,
  isSelected,
  pixelsPerSecond,
  preview,
  project,
  trackClipTop,
  trackClipRowHeight,
  trackLocked,
  onSelectClip,
  onClipHoverChange,
  onBeginClipInteraction,
}: ProjectTimelineClipProps) {
  const viewModel = buildProjectTimelineClipViewModel({
    clip,
    isHovered,
    isSelected,
    pixelsPerSecond,
    project,
    trackLocked,
    ...(trackClipTop === undefined ? {} : { trackClipTop }),
    ...(trackClipRowHeight === undefined ? {} : { trackClipRowHeight }),
  });

  return (
    <ProjectTimelineClipLayout
      clip={clip}
      {...(preview ? { preview } : {})}
      project={project}
      trackLocked={trackLocked}
      viewModel={viewModel}
      onSelectClip={onSelectClip}
      onClipHoverChange={onClipHoverChange}
      onBeginClipInteraction={onBeginClipInteraction}
    />
  );
}
