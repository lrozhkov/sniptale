import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorWorkspaceMain } from './main';
import { createHeaderController, createPreviewController } from './main.test-support';

const audioRecordingModalSpy = vi.fn();
const libraryPanelSpy = vi.fn();
const floatingWorkspaceSpy = vi.fn();
const previewSpy = vi.fn();
const timelineSpy = vi.fn();

vi.mock('../floating', () => ({
  VideoEditorFloatingWorkspace: (props: unknown) => {
    floatingWorkspaceSpy(props);
    return <div data-testid="floating-workspace" />;
  },
}));

vi.mock('../../library/panel', () => ({
  VideoEditorLibraryPanel: (props: unknown) => {
    libraryPanelSpy(props);
    return <div data-testid="library-panel" />;
  },
}));

vi.mock('../../recording/audio-modal', () => ({
  AudioRecordingModal: (props: unknown) => {
    audioRecordingModalSpy(props);
    return <div data-testid="audio-recording-modal" />;
  },
}));

vi.mock('../../preview/stage', () => ({
  PreviewStage: (props: unknown) => {
    previewSpy(props);
    return <div data-testid="preview" />;
  },
}));

vi.mock('../../timeline/project', () => ({
  ProjectTimeline: (props: unknown) => {
    timelineSpy(props);
    return <div data-testid="timeline" />;
  },
}));

function createWorkspaceController() {
  const projectActions = createSidebarProjectActions();
  return {
    diagnostics: {} as never,
    header: createHeaderController(),
    layout: createLayoutController(),
    preview: createPreviewController(),
    sidebar: createSidebarController(projectActions),
    timeline: createTimelineController(),
  };
}

function createLayoutController() {
  return {
    audioRecordingDialogOpen: false,
    closeAudioRecordingDialog: vi.fn(),
    handleStartVerticalResize: vi.fn(),
    leftSidebarCollapsed: true,
    openAudioRecordingDialog: vi.fn(),
    previewPaneHeight: 280,
    toggleSidebarCollapsed: vi.fn(),
    workspaceSplitRef: { current: null },
  };
}

function createSidebarController(projectActions = createSidebarProjectActions()) {
  return {
    clipActions: createSidebarClipActions(),
    projectActions,
    state: createSidebarState(),
  } as never;
}

function createSidebarClipActions() {
  return {
    onDetachClipGroup: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
  };
}

function createSidebarProjectActions() {
  return {
    onAddActionEvent: vi.fn(),
    onApplyEffectDocument: vi.fn(() => 'template-instance-1'),
    onAddRecording: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImportAudio: vi.fn(),
    onImportImage: vi.fn(),
    onImportRecordedAudio: vi.fn(),
    onImportVideo: vi.fn(),
    onOpenProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onResizeProject: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onToggleDiagnostics: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
  };
}

function createSidebarState() {
  return {
    activeProjectId: 'project-1',
    collapsed: true,
    diagnosticsContent: 'diagnostics',
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
    project: { id: 'project-1' },
    projects: [],
    recordingId: 'recording-1',
    recordings: [],
    selectedClip: null,
    selectedTrack: null,
  };
}

function createTimelineInsertionActions() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onAddShapeOverlay: vi.fn(),
    onAddTextOverlay: vi.fn(),
    onAddTrack: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImport: {
      audio: vi.fn(),
      image: vi.fn(),
      video: vi.fn(),
    },
    onUnsupportedFileDrop: vi.fn(),
  };
}

function createTimelineController() {
  return {
    actions: createTimelineActions(),
    state: createTimelineState(),
  } as never;
}

function createTimelineActions() {
  return {
    insertion: createTimelineInsertionActions(),
    onDeleteSelectedClip: vi.fn(),
    onDeleteSelectedTimelineObject: vi.fn(),
    onClearPlaybackRange: vi.fn(),
    onDuplicateSelectedClip: vi.fn(),
    onMoveActionEvent: vi.fn(),
    onMoveClip: vi.fn(),
    onMoveCursorSegment: vi.fn(),
    onMoveMotionRegion: vi.fn(),
    onMoveTrack: vi.fn(),
    onMoveTransitionSegment: vi.fn(),
    onResizeActionEvent: vi.fn(),
    onResizeMotionRegion: vi.fn(),
    onSeek: vi.fn(),
    onSetPlaybackRange: vi.fn(),
    onSelectActionSegment: vi.fn(),
    onSelectClip: vi.fn(),
    onSelectCursorSegment: vi.fn(),
    onSelectMotionRegion: vi.fn(),
    onSelectScene: vi.fn(),
    onSelectTrack: vi.fn(),
    onSelectTransition: vi.fn(),
    onSplitSelectedClip: vi.fn(),
    onTogglePlay: vi.fn(),
    onToggleTrackLock: vi.fn(),
    onToggleTrackVisibility: vi.fn(),
    onTimelinePreviewSuspendedChange: vi.fn(),
    onTimelinePreviewViewportChange: vi.fn(),
    onTrimClipEnd: vi.fn(),
    onTrimClipStart: vi.fn(),
    onZoomChange: vi.fn(),
  };
}

function createTimelineState() {
  return {
    currentTime: 8,
    isPlaying: false,
    magnetEnabled: true,
    pixelsPerSecond: 110,
    playbackRange: null,
    project: { id: 'project-1' },
    selection: { kind: 'scene' },
    selectedClipId: 'clip-1',
    selectedTrackId: 'track-1',
    timelinePreviews: {
      'clip-1': { kind: 'image', urls: ['blob:image'] },
    },
  };
}

function expectWorkspaceMarkup(markup: string) {
  expect(markup).toContain('video-editor.workspace.canvas-shell');
  expect(markup).toContain('pt-[4.75rem]');
  expect(markup).toContain('pr-3');
  expect(markup).not.toContain('pr-[21.75rem]');
  expect(markup).toContain('max-[860px]:pt-[11.75rem]');
  expect(markup).toContain('flex-col gap-0');
  expect(markup).toContain('flex min-h-0 shrink-0 gap-3');
  expect(markup).toContain('video-editor.workspace.timeline-resize-zone');
  expect(markup).toContain('h-2 shrink-0 cursor-row-resize');
  expect(markup).not.toContain('h-1.5 w-full rounded-full');
  expect(markup).not.toContain('pl-[4.75rem]');
}

function verifyWorkspaceMainRouting() {
  const markup = renderToStaticMarkup(
    <VideoEditorWorkspaceMain
      controller={createWorkspaceController()}
      previewHeightStyle={{ height: '280px' }}
    />
  );

  expect(floatingWorkspaceSpy.mock.calls[0]?.[0]).toMatchObject({
    controller: {
      header: {
        libraryPanelOpen: true,
        leftSidebarCollapsed: true,
        projectExportsCount: 2,
        projectName: 'Workspace Main',
      },
      sidebar: {
        state: {
          activeProjectId: 'project-1',
          collapsed: true,
          diagnosticsContent: 'diagnostics',
        },
      },
    },
  });
  expect(previewSpy.mock.calls[0]?.[0]).toMatchObject({
    currentTime: 8,
    selectedClipId: 'clip-1',
  });
  expect(timelineSpy.mock.calls[0]?.[0]).toMatchObject({
    currentTime: 8,
    magnetEnabled: true,
    pixelsPerSecond: 110,
    playbackRange: null,
    selectedClipId: 'clip-1',
    selectedTrackId: 'track-1',
    timelinePreviews: {
      'clip-1': { kind: 'image', urls: ['blob:image'] },
    },
  });
  expectWorkspaceMarkup(markup);
}

describe('VideoEditorWorkspaceMain', () => {
  afterEach(() => {
    floatingWorkspaceSpy.mockReset();
    previewSpy.mockReset();
    timelineSpy.mockReset();
    libraryPanelSpy.mockReset();
    audioRecordingModalSpy.mockReset();
  });

  it(
    'routes header, sidebar, preview, and timeline props through workspace slices',
    verifyWorkspaceMainRouting
  );
});
