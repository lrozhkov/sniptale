import { translate } from '../../../../../../platform/i18n';
import { VideoMotionCameraMode } from '../../../../../../features/video/project/types';
import type { VideoProjectMotionPath } from '../../../../../../features/video/project/types';
import type { VideoProjectMotionRegion } from '../../../../../../features/video/project/types';
import { rebalanceMotionPathOffsets } from '../../../../../project/motion-path/core';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';

export const PATH_CARD_CLASS_NAME = [
  'space-y-3 rounded-[16px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,transparent)]',
].join(' ');

export interface MotionPathEditorProps {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
  path: VideoProjectMotionPath;
}

export function patchMotionPath(
  panel: WorkspaceSidebarSelectionPanelProps,
  motionRegionId: string,
  path: VideoProjectMotionPath
) {
  panel.onUpdateMotionRegion(motionRegionId, {
    cameraMode: VideoMotionCameraMode.PATH,
    path: rebalanceMotionPathOffsets(path),
  });
}

export function createStopLabel(index: number) {
  return `${translate('videoEditor.sidebar.motionPathStopLabel')} ${index + 1}`;
}

export function createSegmentLabel(index: number) {
  return `${translate('videoEditor.sidebar.motionPathSegmentLabel')} ${index + 1}`;
}
