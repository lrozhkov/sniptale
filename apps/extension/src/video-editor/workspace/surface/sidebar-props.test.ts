import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { getWorkspaceSidebarProps } from './sidebar-props';

function createClipActions() {
  return {
    onApplyMediaClipVisualsToTrack: vi.fn(),
    onConvertTextClipToAnnotation: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipPlaybackRate: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMediaClipFitScalePercent: vi.fn(),
    onUpdateMediaClipShadowIntensity: vi.fn(),
    onUpdateMediaClipShadowMode: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateSubtitleTrackStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
  };
}

function createProjectActions() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onAddRecording: vi.fn(),
    onAddTrack: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDeleteTrack: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImportAudio: vi.fn(),
    onImportImage: vi.fn(),
    onImportVideo: vi.fn(),
    onOpenProject: vi.fn(),
    onRenameTrack: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onToggleDiagnostics: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
  };
}

function createSidebarState() {
  return {
    activeProjectId: 'project-1',
    collapsed: false,
    diagnosticsContent: null,
    diagnosticsOpen: false,
    gridSettings: {
      color: '#94a3b8',
      enabled: false,
      size: 80,
      snapEnabled: true,
      onSetColor: vi.fn(),
      onSetEnabled: vi.fn(),
      onSetSize: vi.fn(),
      onSetSnapEnabled: vi.fn(),
    },
    inspectorMode: 'selection',
    placementMode: null,
    project: createEmptyVideoProject('Sidebar'),
    projects: [],
    recordingId: null,
    recordings: [],
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: { kind: 'scene' },
  };
}

function createController() {
  return {
    sidebar: {
      clipActions: createClipActions(),
      projectActions: createProjectActions(),
      state: createSidebarState(),
    },
  };
}

describe('workspace/sidebar-props', () => {
  it('keeps active workspace sidebar handlers wired through the controller seam', () => {
    const controller = createController();
    const props = getWorkspaceSidebarProps(controller as never);

    expect(props.onRenameTrack).toBe(controller.sidebar.projectActions.onRenameTrack);
    expect(props.gridSettings).toBe(controller.sidebar.state.gridSettings);
    expect(props.onApplyMediaClipVisualsToTrack).toBe(
      controller.sidebar.clipActions.onApplyMediaClipVisualsToTrack
    );
    expect(props.onConvertTextClipToAnnotation).toBe(
      controller.sidebar.clipActions.onConvertTextClipToAnnotation
    );
    expect(props.onUpdateAnnotationClipContent).toBe(
      controller.sidebar.clipActions.onUpdateAnnotationClipContent
    );
    expect(props.onUpdateAnnotationClipStyle).toBe(
      controller.sidebar.clipActions.onUpdateAnnotationClipStyle
    );
    expect(props.onUpdateAnnotationClipTemplate).toBe(
      controller.sidebar.clipActions.onUpdateAnnotationClipTemplate
    );
    props.onUpdateClipPlaybackRate?.('clip-1', 1.25);
    expect(props.onUpdateMediaClipFitScalePercent).toBe(
      controller.sidebar.clipActions.onUpdateMediaClipFitScalePercent
    );
    expect(props.onUpdateMediaClipShadowIntensity).toBe(
      controller.sidebar.clipActions.onUpdateMediaClipShadowIntensity
    );
    expect(props.onUpdateMediaClipShadowMode).toBe(
      controller.sidebar.clipActions.onUpdateMediaClipShadowMode
    );
    expect(props.onUpdateEffectInstance).toBe(
      controller.sidebar.projectActions.onUpdateEffectInstance
    );
    props.onUpdateSubtitleTrackStyle?.('track-1', { color: '#fff' });

    expect(controller.sidebar.clipActions.onUpdateClipPlaybackRate).toHaveBeenCalledWith(
      'clip-1',
      1.25
    );
    expect(controller.sidebar.clipActions.onUpdateSubtitleTrackStyle).toHaveBeenCalledWith(
      'track-1',
      { color: '#fff' }
    );
  });
});
