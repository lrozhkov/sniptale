import type { CameraPositionEdit } from '../../../../features/video/project/camera/animation';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type {
  VideoProjectCameraLayout,
  VideoProjectCameraPlacement,
} from '../../../../features/video/project/camera/placement';
import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type {
  VideoProject,
  VideoProjectActionPreset,
  VideoProjectCursorTrack,
  VideoProjectSceneBackground,
} from '../../../../features/video/project/types';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorLibrariesState } from '../../app-model/types';

interface VideoEditorSidebarCommands extends VideoEditorProjectActions, VideoEditorSessionActions {}

interface VideoEditorSidebarState {
  typingProject?: VideoProject;
  recordingTelemetry?: readonly RecordingTelemetryEntry[];
  activeProjectId: string;
  collapsed: boolean;
  gridSettings: {
    color: string;
    enabled: boolean;
    size: number;
    snapEnabled: boolean;
    onSetColor: VideoEditorWorkspaceState['grid']['setGridColor'];
    onSetEnabled: VideoEditorWorkspaceState['grid']['setGridEnabled'];
    onSetSize: VideoEditorWorkspaceState['grid']['setGridSize'];
    onSetSnapEnabled: VideoEditorWorkspaceState['grid']['setGridSnapEnabled'];
  };
  inspectorMode: VideoEditorWorkspaceState['inspector']['mode'];
  placementMode: VideoEditorPlacementMode | null;
  project: VideoProject;
  projects: VideoEditorLibrariesState['projects'];
  recentColors: string[];
  recordingId: string | null;
  recordings: VideoEditorLibrariesState['recordings'];
  currentTime?: number;
  selectedActionOccurrence: VideoEditorSelections['selectedActionOccurrence'];
  canAddCameraPosition?: boolean;
  selectedClip: VideoEditorSelections['selectedClip'];
  selectedCursorSample: VideoEditorSelections['selectedCursorSample'];
  selectedMotionRegion: VideoEditorSelections['selectedMotionRegion'];
  selectedTrack: VideoEditorSelections['selectedTrack'];
  selectedTransition: VideoEditorSelections['selectedTransition'];
  selection: VideoEditorSelection;
}

interface VideoEditorSidebarProjectActions {
  onApplyTypingCompression?: VideoEditorSessionActions['applyTypingCompression'];
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion: () => void;
  onAddRecording: VideoEditorActionHandlers['handleAddRecording'];
  onAddLibraryMedia: VideoEditorActionHandlers['handleAddLibraryMedia'];
  onAddTrack: VideoEditorSidebarCommands['addTrack'];
  onApplyEffectDocument: VideoEditorSidebarCommands['applyEffectDocument'];
  onClearCursorSampleSkinOverride: VideoEditorSidebarCommands['clearCursorSampleSkinOverride'];
  onClearPlacementMode: VideoEditorSidebarCommands['clearPlacementMode'];
  onCreateProject: VideoEditorActionHandlers['handleCreateProject'];
  onDeleteActionEvent: VideoEditorSidebarCommands['deleteActionEvent'];
  onDeleteCursorSample: VideoEditorSidebarCommands['deleteCursorSample'];
  onDeleteMotionRegion: VideoEditorSidebarCommands['deleteMotionRegion'];
  onDeleteObjectTrack: VideoEditorSidebarCommands['deleteObjectTrack'];
  onSelectObjectTrack: VideoEditorSidebarCommands['selectObjectTrack'];

  onDeleteProject: VideoEditorActionHandlers['handleDeleteProject'];
  onDeleteTrack: (trackId: string) => void;
  onEnableCursorTrack: () => void;
  onImportAudio: VideoEditorActionHandlers['handleImportAudio'];
  onImportImage: VideoEditorActionHandlers['handleImportImage'];
  onImportRecordedAudio: VideoEditorActionHandlers['handleImportRecordedAudio'];
  onImportVideo: VideoEditorActionHandlers['handleImportVideo'];
  onInsertCursorSample: VideoEditorSidebarCommands['insertCursorSample'];
  onOpenProject: VideoEditorActionHandlers['handleOpenProject'];
  onRenameTrack: VideoEditorSidebarCommands['renameTrack'];
  onToggleUtilityLaneVisibility: VideoEditorProjectActions['toggleUtilityLaneVisibility'];
  onToggleUtilityLaneLock: VideoEditorProjectActions['toggleUtilityLaneLock'];
  onClearUtilityLane: VideoEditorProjectActions['clearUtilityLane'];
  onToggleTrackLock: VideoEditorSidebarCommands['toggleTrackLock'];
  onToggleTrackVisibility: VideoEditorSidebarCommands['toggleTrackVisibility'];
  onResizeProject: (width: number, height: number) => void;
  onSetCursorCaptureMode: (captureMode: VideoProjectCursorTrack['captureMode']) => void;
  onSetSceneBackground: (sceneBackground: VideoProjectSceneBackground) => void;
  onPreviewSceneBackground: VideoEditorWorkspaceState['sceneBackgroundColors']['setPreview'];
  onRememberRecentColor: VideoEditorWorkspaceState['sceneBackgroundColors']['rememberRecentColor'];
  onResetSceneBackgroundPreview: VideoEditorWorkspaceState['sceneBackgroundColors']['resetPreview'];
  onStartActionPointPlacement: VideoEditorSidebarCommands['startActionPointPlacement'];
  onStartMotionAreaPlacement: VideoEditorSidebarCommands['startMotionAreaPlacement'];
  onStartMotionFocusPlacement: VideoEditorSidebarCommands['startMotionFocusPlacement'];

  onStartObjectTrackAnchorPlacement: VideoEditorSidebarCommands['startObjectTrackAnchorPlacement'];
  onToggleCollapsed: VideoEditorWorkspaceState['toggleSidebarCollapsed'];
  onUpdateActionPresentation: VideoEditorSidebarCommands['updateActionPresentation'];
  onUpdateActionEventDetails: VideoEditorSidebarCommands['updateActionEventDetails'];
  onUpdateCursorSampleInterpolation: VideoEditorSidebarCommands['updateCursorSampleInterpolation'];
  onUpdateCursorSampleSkinOverride: VideoEditorSidebarCommands['updateCursorSampleSkinOverride'];
  onUpdateCursorSampleVisibility: VideoEditorSidebarCommands['updateCursorSampleVisibility'];
  onUpdateCursorSkin: (patch: Partial<NonNullable<VideoProjectCursorTrack['skin']>>) => void;
  onUpdateMotionRegion: VideoEditorSidebarCommands['updateMotionRegion'];
  onUpdateTransitionDuration: VideoEditorSidebarCommands['updateTransitionDuration'];
  onUpdateTransitionEasing: VideoEditorSidebarCommands['updateTransitionEasing'];
  onUpdateTransitionTemplate: VideoEditorSidebarCommands['updateTransitionTemplate'];
  onDeleteEffectInstance: VideoEditorSidebarCommands['deleteEffectInstance'];
  onDuplicateEffectInstance: VideoEditorSidebarCommands['duplicateEffectInstance'];
  onMoveEffectInstance: VideoEditorSidebarCommands['moveEffectInstance'];
  onUpdateEffectInstance: VideoEditorSidebarCommands['updateEffectInstance'];
  onUpsertObjectTrackCorrectionAnchor: VideoEditorSidebarCommands['upsertObjectTrackCorrectionAnchor'];
}

interface VideoEditorSidebarClipActions {
  onConvertTextClipToAnnotation: VideoEditorSidebarCommands['convertTextClipToAnnotation'];
  onSwapClip: VideoEditorSidebarCommands['swapClip'];
  onTrimClipStart: VideoEditorSidebarCommands['trimClipStart'];
  onTrimClipEnd: VideoEditorSidebarCommands['trimClipEnd'];
  onDetachClipGroup: VideoEditorSidebarCommands['detachClipGroup'];
  onUpdateClipAudioEnvelope: VideoEditorSidebarCommands['updateClipAudioEnvelope'];
  onUpdateClipFades: VideoEditorSidebarCommands['updateClipFades'];
  onUpdateClipPlaybackRate: VideoEditorSidebarCommands['updateClipPlaybackRate'];
  onUpdateClipMuted: VideoEditorSidebarCommands['updateClipMuted'];
  onApplyCameraLayout?: (
    clipId: string,
    layout: VideoProjectCameraLayout,
    placement?: VideoProjectCameraPlacement
  ) => void;
  onEditCameraPosition?: (clipId: string, edit: CameraPositionEdit) => void;
  onUpdateClipTransform: VideoEditorSidebarCommands['updateClipTransform'];
  onUpdateClipVolume: VideoEditorSidebarCommands['updateClipVolume'];
  onApplyMediaClipVisualsToTrack: VideoEditorSidebarCommands['applyMediaClipVisualsToTrack'];
  onUpdateMediaClipFitMode: VideoEditorSidebarCommands['updateMediaClipFitMode'];
  onUpdateMediaClipFitScalePercent: VideoEditorSidebarCommands['updateMediaClipFitScalePercent'];
  onUpdateMediaClipShadowIntensity: VideoEditorSidebarCommands['updateMediaClipShadowIntensity'];
  onUpdateMediaClipShadowMode: VideoEditorSidebarCommands['updateMediaClipShadowMode'];
  onUpdateAnnotationClipContent: VideoEditorSidebarCommands['updateAnnotationClipContent'];
  onUpdateAnnotationClipStyle: VideoEditorSidebarCommands['updateAnnotationClipStyle'];
  onUpdateAnnotationClipTemplate: VideoEditorSidebarCommands['updateAnnotationClipTemplate'];
  onUpdateShapeStyle: VideoEditorSidebarCommands['updateShapeClipStyle'];
  onUpdateSubtitleTrackStyle: VideoEditorSidebarCommands['updateSubtitleTrackStyle'];
  onUpdateTextContent: VideoEditorSidebarCommands['updateTextClipContent'];
  onUpdateTextStyle: VideoEditorSidebarCommands['updateTextClipStyle'];
}

export interface VideoEditorSidebarController {
  clipActions: VideoEditorSidebarClipActions;
  projectActions: VideoEditorSidebarProjectActions;
  state: VideoEditorSidebarState;
}
