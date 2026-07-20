import { vi } from 'vitest';
import type { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import { createSceneSelection } from '../../project/selection/model';

const noop = () => vi.fn();
type SidebarProjectActions = VideoEditorWorkspaceController['sidebar']['projectActions'];

function createCursorDetection(): VideoEditorWorkspaceController['sidebar']['cursorDetection'] {
  return {
    cancel: noop(),
    runForClip: vi.fn(async () => undefined),
    runForSelectedClip: vi.fn(async () => undefined),
    runLocalRecalculation: vi.fn(async () => undefined),
    selectedClipAvailability: { canRun: false, reason: null },
    state: {
      clipId: null,
      error: null,
      processedFrames: 0,
      progress: 0,
      status: 'idle',
      totalFrames: 0,
      trackId: null,
    },
  };
}

function createProjectCrudActions(): Pick<
  SidebarProjectActions,
  | 'onCreateProject'
  | 'onDeleteProject'
  | 'onOpenProject'
  | 'onAddRecording'
  | 'onImportAudio'
  | 'onImportImage'
  | 'onImportRecordedAudio'
  | 'onImportVideo'
> {
  return {
    onAddRecording: noop(),
    onCreateProject: noop(),
    onDeleteProject: noop(),
    onImportAudio: noop(),
    onImportImage: noop(),
    onImportRecordedAudio: vi.fn(async () => undefined),
    onImportVideo: noop(),
    onOpenProject: noop(),
  };
}

function createProjectPlacementActions(): Pick<
  SidebarProjectActions,
  | 'onAddActionEvent'
  | 'onAddMotionRegion'
  | 'onClearPlacementMode'
  | 'onStartActionPointPlacement'
  | 'onStartMotionAreaPlacement'
  | 'onStartMotionFocusPlacement'
  | 'onStartMotionPathStopAreaPlacement'
  | 'onStartMotionPathStopPointPlacement'
  | 'onStartObjectTrackAnchorPlacement'
> {
  return {
    onAddActionEvent: noop(),
    onAddMotionRegion: noop(),
    onClearPlacementMode: noop(),
    onStartActionPointPlacement: noop(),
    onStartMotionAreaPlacement: noop(),
    onStartMotionFocusPlacement: noop(),
    onStartMotionPathStopAreaPlacement: noop(),
    onStartMotionPathStopPointPlacement: noop(),
    onStartObjectTrackAnchorPlacement: noop(),
  };
}

function createProjectEditActions(): Omit<
  SidebarProjectActions,
  | keyof ReturnType<typeof createProjectCrudActions>
  | keyof ReturnType<typeof createProjectPlacementActions>
> {
  return {
    onAddTrack: noop(),
    onApplyEffectDocument: noop(),
    onClearCursorSampleSkinOverride: noop(),
    onDeleteActionEvent: noop(),
    onDeleteCursorSample: noop(),
    onDeleteMotionRegion: noop(),
    onDeleteObjectTrack: noop(),
    onDeleteTrack: noop(),
    onDeleteEffectInstance: noop(),
    onDuplicateEffectInstance: noop(),
    onEnableCursorTrack: noop(),
    onGenerateMotionPathFromCursor: noop(),
    onInsertCursorSample: noop(),
    onMoveEffectInstance: noop(),
    onPreviewSceneBackground: noop(),
    onRememberRecentColor: noop(),
    onRenameTrack: noop(),
    onResetSceneBackgroundPreview: noop(),
    onResizeProject: noop(),
    onSelectObjectTrack: noop(),
    onSetCursorCaptureMode: noop(),
    onSetSceneBackground: noop(),
    onToggleCollapsed: noop(),
    onToggleDiagnostics: noop(),
    onUpdateActionEventDetails: noop(),
    onUpdateCursorSampleInterpolation: noop(),
    onUpdateCursorSampleSkinOverride: noop(),
    onUpdateCursorSampleVisibility: noop(),
    onUpdateCursorSkin: noop(),
    onUpdateMotionRegion: noop(),
    onUpdateTransitionDuration: noop(),
    onUpdateTransitionEasing: noop(),
    onUpdateTransitionTemplate: noop(),
    onUpdateEffectInstance: noop(),
    onUpsertObjectTrackCorrectionAnchor: noop(),
  };
}

function createSidebarProjectActions(): SidebarProjectActions {
  return {
    ...createProjectCrudActions(),
    ...createProjectPlacementActions(),
    ...createProjectEditActions(),
  };
}

function createClipActions(): VideoEditorWorkspaceController['sidebar']['clipActions'] {
  return {
    onApplyMediaClipVisualsToTrack: noop(),
    onConvertTextClipToAnnotation: noop(),
    onDetachClipGroup: noop(),
    onUpdateAnnotationClipContent: noop(),
    onUpdateAnnotationClipStyle: noop(),
    onUpdateAnnotationClipTemplate: noop(),
    onUpdateClipAudioEnvelope: noop(),
    onUpdateClipFades: noop(),
    onUpdateClipMuted: noop(),
    onUpdateClipPlaybackRate: noop(),
    onUpdateClipTransform: noop(),
    onUpdateClipVolume: noop(),
    onUpdateMediaClipFitMode: noop(),
    onUpdateMediaClipFitScalePercent: noop(),
    onUpdateMediaClipShadowIntensity: noop(),
    onUpdateMediaClipShadowMode: noop(),
    onUpdateShapeStyle: noop(),
    onUpdateSubtitleTrackStyle: noop(),
    onUpdateTextContent: noop(),
    onUpdateTextStyle: noop(),
  };
}

export function createSidebarController(
  project: ReturnType<typeof createEmptyVideoProject>
): VideoEditorWorkspaceController['sidebar'] {
  return {
    clipActions: createClipActions(),
    cursorDetection: createCursorDetection(),
    projectActions: createSidebarProjectActions(),
    state: {
      activeProjectId: project.id,
      collapsed: false,
      diagnosticsContent: null,
      diagnosticsOpen: false,
      gridSettings: {
        color: '#94a3b8',
        enabled: false,
        onSetColor: noop(),
        onSetEnabled: noop(),
        onSetSize: noop(),
        onSetSnapEnabled: noop(),
        size: 80,
        snapEnabled: true,
      },
      inspectorMode: 'selection',
      placementMode: null,
      project,
      projects: [],
      recentColors: [],
      recordingId: null,
      recordings: [],
      selectedActionEvent: null,
      selectedClip: null,
      selectedCursorSample: null,
      selectedMotionRegion: null,
      selectedTrack: null,
      selectedTransition: null,
      selection: createSceneSelection(),
    },
  };
}
