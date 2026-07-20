import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

function createMotionCallbacks() {
  return {
    onAddActionEvent: () => undefined,
    onAddMotionRegion: () => undefined,
    onClearCursorSampleSkinOverride: () => undefined,
    onClearPlacementMode: () => undefined,
    onDeleteActionEvent: () => undefined,
    onDeleteCursorSample: () => undefined,
    onDeleteMotionRegion: () => undefined,
    onGenerateMotionPathFromCursor: () => undefined,
    onDetachClipGroup: () => undefined,
    onEnableCursorTrack: () => undefined,
    onInsertCursorSample: () => undefined,
    onPreviewSceneBackground: () => undefined,
    onRememberRecentColor: async () => undefined,
    onResetSceneBackgroundPreview: () => undefined,
    onResizeProject: () => undefined,
    onSetCursorCaptureMode: () => undefined,
    onSetSceneBackground: () => undefined,
    onStartActionPointPlacement: () => undefined,
    onStartMotionAreaPlacement: () => undefined,
    onStartMotionFocusPlacement: () => undefined,
    onStartMotionPathStopAreaPlacement: () => undefined,
    onStartMotionPathStopPointPlacement: () => undefined,
    onUpdateActionEventDetails: () => undefined,
    onUpdateClipAudioEnvelope: () => undefined,
    onUpdateClipFades: () => undefined,
    onUpdateClipMuted: () => undefined,
    onUpdateClipTransform: () => undefined,
    onUpdateClipVolume: () => undefined,
    onUpdateCursorSampleInterpolation: () => undefined,
    onUpdateCursorSampleSkinOverride: () => undefined,
    onUpdateCursorSampleVisibility: () => undefined,
    onUpdateCursorSkin: () => undefined,
    onUpdateMediaClipFitMode: () => undefined,
    onUpdateMotionRegion: () => undefined,
    onUpdateShapeStyle: () => undefined,
    onUpdateTextContent: () => undefined,
    onUpdateTextStyle: () => undefined,
    onUpdateTransitionDuration: () => undefined,
    onUpdateTransitionEasing: () => undefined,
    onUpdateTransitionTemplate: () => undefined,
  };
}

export function createMotionPanelProps(
  regionOverride?: Partial<NonNullable<WorkspaceSidebarSelectionPanelProps['selectedMotionRegion']>>
): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Motion');
  const motionRegion = {
    ...createVideoProjectMotionRegion(project, 0.5),
    ...regionOverride,
  };
  project.motionRegions = [motionRegion];

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: motionRegion,
    selectedTrack: null,
    selectedTransition: null,
    selection: { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: motionRegion.id },
    ...createMotionCallbacks(),
  };
}
