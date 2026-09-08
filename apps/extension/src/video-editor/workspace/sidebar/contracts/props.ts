import type { CameraPositionEdit } from '../../../../features/video/project/camera/animation';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoProjectActionOccurrence } from '../../../../features/video/project/action-occurrences';
import type {
  VideoProjectCameraLayout,
  VideoProjectCameraPlacement,
} from '../../../../features/video/project/camera/placement';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type {
  VideoProjectAnnotationStylePatch,
  VideoProjectAnnotationTemplatePatch,
} from '../../../../features/video/project/annotation/contract';
import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorInspectorMode } from '../../../contracts/workspace';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoObjectTrack } from '../../../../features/video/project/object-tracks';
import type { VideoObjectTrackCorrectionAnchor } from '../../../../features/video/project/object-tracks';
import type {
  VideoProject,
  VideoProjectAnnotationClip,
  VideoProjectClip,
  VideoProjectCursorSample,
  VideoProjectMotionRegion,
  VideoProjectTrack,
  VideoProjectTransition,
} from '../../../../features/video/project/types';
import type {
  VideoEditorMotionRegionPatch,
  VideoProjectEffectInstancePatch,
} from '../../../contracts/commands/patches';
import type {
  VideoCursorCaptureMode,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectActionPreset,
  VideoProjectCursorTrack,
  VideoTransitionEasing,
} from '../../../../features/video/project/types';
import type { ProjectListItem, RecordingListItem } from '../../../library/contracts/items';

export interface WorkspaceSidebarProps {
  typingProject?: VideoProject;
  recordingTelemetry?: readonly RecordingTelemetryEntry[];
  onApplyTypingCompression?: VideoEditorSessionActions['applyTypingCompression'];
  currentTime?: number;
  activeProjectId: string;
  collapsed: boolean;
  gridSettings: WorkspaceSidebarGridSettings;
  inspectorMode: VideoEditorInspectorMode;
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion?: () => void;
  onAddRecording: (recordingId: string) => void;
  onAddTrack?: (kind?: VideoProjectTrack['kind']) => void;
  onAddSubtitleOverlay?: () => void;
  onClearCursorSampleSkinOverride?: (sampleId: string) => void;
  onClearPlacementMode?: () => void;
  onCreateProject: () => void | Promise<void>;
  onDeleteActionEvent?: (actionEventId: string) => void;
  onDeleteCursorSample?: (sampleId: string) => void;
  onDeleteMotionRegion?: (motionRegionId: string) => void;
  onDeleteObjectTrack?: (trackId: string) => void;
  onSelectObjectTrack?: (trackId: string) => void;

  onDeleteProject: (projectId: string) => void | Promise<void>;
  onDeleteTrack?: (trackId: string) => void;
  onSwapClip?: VideoEditorProjectActions['swapClip'];
  onTrimClipStart?: VideoEditorProjectActions['trimClipStart'];
  onTrimClipEnd?: VideoEditorProjectActions['trimClipEnd'];
  onDetachClipGroup: (clipId: string) => void;
  onEnableCursorTrack: () => void;
  onImportAudio: (file: File) => void;
  onImportImage: (file: File) => void;
  onImportVideo: (file: File) => void;
  onInsertCursorSample?: (time: number) => void;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onPreviewSceneBackground?: (
    sceneBackground: NonNullable<VideoProject['sceneBackground']> | null
  ) => void;
  onRememberRecentColor?: (color: string) => Promise<void>;
  onResetSceneBackgroundPreview?: () => void;
  onResizeProject: (width: number, height: number) => void;
  onRenameTrack?: (trackId: string, name: string) => void;
  onToggleUtilityLaneVisibility?: VideoEditorProjectActions['toggleUtilityLaneVisibility'];
  onToggleUtilityLaneLock?: VideoEditorProjectActions['toggleUtilityLaneLock'];
  onClearUtilityLane?: VideoEditorProjectActions['clearUtilityLane'];
  onToggleTrackLock?: (trackId: string) => void;
  onToggleTrackVisibility?: (trackId: string) => void;
  onSetCursorCaptureMode: (mode: VideoCursorCaptureMode) => void;
  onSetSceneBackground: (sceneBackground: NonNullable<VideoProject['sceneBackground']>) => void;
  onStartActionPointPlacement?: (eventId: string, clipId: string | null) => void;
  onStartMotionAreaPlacement?: (motionRegionId: string) => void;
  onStartMotionFocusPlacement?: (motionRegionId: string) => void;

  onStartObjectTrackAnchorPlacement?: (objectTrackId: string) => void;
  onToggleCollapsed: () => void;
  onUpdateActionPresentation?: (
    patch: Partial<
      import('../../../../features/video/project/types').VideoProjectActionPresentation
    >
  ) => void;
  onUpdateActionEventDetails?: (
    actionEventId: string,
    patch: import('../../../contracts/commands/patches').VideoEditorActionEventPatch
  ) => void;
  onUpdateAnnotationClipContent?: (
    clipId: string,
    patch: Partial<VideoProjectAnnotationClip['content']>
  ) => void;
  onUpdateAnnotationClipStyle?: (clipId: string, patch: VideoProjectAnnotationStylePatch) => void;
  onUpdateAnnotationClipTemplate?: (
    clipId: string,
    patch: VideoProjectAnnotationTemplatePatch
  ) => void;
  onUpdateClipAudioEnvelope: (
    clipId: string,
    patch: { volumeEnvelopeEnd?: number; volumeEnvelopeStart?: number }
  ) => void;
  onUpdateClipFades: (clipId: string, patch: { fadeInMs?: number; fadeOutMs?: number }) => void;
  onUpdateClipPlaybackRate?: (clipId: string, playbackRate: number) => void;
  onUpdateClipMuted: (clipId: string, muted: boolean) => void;
  onApplyCameraLayout?: (
    clipId: string,
    layout: VideoProjectCameraLayout,
    placement?: VideoProjectCameraPlacement
  ) => void;
  onEditCameraPosition?: (clipId: string, edit: CameraPositionEdit) => void;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  onUpdateClipVolume: (clipId: string, volume: number) => void;
  onUpdateCursorSampleInterpolation?: (
    sampleId: string,
    interpolation: NonNullable<VideoProjectCursorSample['interpolation']>
  ) => void;
  onUpdateCursorSampleSkinOverride?: (
    sampleId: string,
    patch: Partial<VideoProjectCursorTrack['skin']>
  ) => void;
  onUpdateCursorSampleVisibility?: (sampleId: string, visible: boolean) => void;
  onUpdateCursorSkin: (patch: Partial<VideoProjectCursorTrack['skin']>) => void;
  onUpdateMediaClipFitMode: (clipId: string, fitMode: VideoMediaFitMode) => void;
  onUpdateMediaClipFitScalePercent?: (clipId: string, fitScalePercent: number) => void;
  onUpdateMediaClipShadowIntensity?: (clipId: string, shadowIntensity: number) => void;
  onUpdateMediaClipShadowMode?: (clipId: string, shadowMode: VideoMediaShadowMode) => void;
  onApplyMediaClipVisualsToTrack?: (clipId: string) => void;
  onConvertTextClipToAnnotation?: (
    clipId: string,
    templateKind: VideoProjectAnnotationClip['templateKind']
  ) => void;
  onUpdateMotionRegion?: (motionRegionId: string, patch: VideoEditorMotionRegionPatch) => void;
  onUpdateShapeStyle: (clipId: string, patch: Record<string, string | number>) => void;
  onUpdateSubtitleTrackStyle?: (trackId: string, patch: Record<string, string | number>) => void;
  onUpdateTextContent: (clipId: string, text: string) => void;
  onUpdateTextStyle: (clipId: string, patch: Record<string, string | number>) => void;
  onUpdateTransitionDuration?: (transitionId: string, duration: number) => void;
  onUpdateTransitionEasing?: (transitionId: string, easing: VideoTransitionEasing) => void;
  onUpdateTransitionTemplate?: (
    transitionId: string,
    patch: Partial<
      Pick<VideoProjectTransition, 'direction' | 'highlightColor' | 'intensity' | 'templateKind'>
    >
  ) => void;
  onDeleteEffectInstance?: (instanceId: string) => void;
  onDuplicateEffectInstance?: (instanceId: string) => string | null;
  onMoveEffectInstance?: (instanceId: string, direction: 'down' | 'up') => void;
  onUpdateEffectInstance?: (instanceId: string, patch: VideoProjectEffectInstancePatch) => void;
  onUpsertObjectTrackCorrectionAnchor?: (
    trackId: string,
    anchor: Omit<VideoObjectTrackCorrectionAnchor, 'id'> & { id?: string }
  ) => void;
  placementMode?: VideoEditorPlacementMode | null;
  project: VideoProject;
  projects: ProjectListItem[];
  recentColors?: string[];
  recordingId: string | null;
  recordings: RecordingListItem[];
  selectedActionOccurrence?: VideoProjectActionOccurrence | null;
  canAddCameraPosition?: boolean;
  selectedClip: VideoProjectClip | null;
  selectedCursorSample?: VideoProjectCursorSample | null;
  selectedMotionRegion?: VideoProjectMotionRegion | null;
  selectedObjectTrack?: VideoObjectTrack | null;
  selectedTrack: VideoProjectTrack | null;
  selectedTransition?: VideoProjectTransition | null;
  selection?: VideoEditorSelection;
}

export interface WorkspaceSidebarGridSettings {
  color: string;
  enabled: boolean;
  size: number;
  snapEnabled: boolean;
  onSetColor: (color: string) => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetSize: (size: number) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
}
