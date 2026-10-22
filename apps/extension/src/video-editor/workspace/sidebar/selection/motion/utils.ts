import { motionFocusAreaPoint } from '../../../../../features/video/project/motion/focus-area';
import { createMotionFocusAreaFromPointScale } from '../../../../../features/video/project/motion/index';
import type { VideoProjectMotionArea } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

export function getProjectCenter(panel: WorkspaceSidebarSelectionPanelProps) {
  return {
    x: panel.project.width / 2,
    y: panel.project.height / 2,
  };
}

export function getAreaCenter(area: VideoProjectMotionArea) {
  return motionFocusAreaPoint(area, 0.5, 0.5);
}

function getRegionFocusPoint(panel: WorkspaceSidebarSelectionPanelProps) {
  const motionRegion = panel.selectedMotionRegion;
  if (motionRegion?.focusArea) {
    return getAreaCenter(motionRegion.focusArea);
  }

  return motionRegion?.focusPoint ?? getProjectCenter(panel);
}

export function getDefaultFocusArea(panel: WorkspaceSidebarSelectionPanelProps) {
  const motionRegion = panel.selectedMotionRegion;
  return createMotionFocusAreaFromPointScale(
    panel.project,
    getRegionFocusPoint(panel),
    motionRegion?.scale ?? 1.35
  );
}
