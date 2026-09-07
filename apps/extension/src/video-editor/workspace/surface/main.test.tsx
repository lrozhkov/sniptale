// @vitest-environment jsdom
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorWorkspaceMain } from './main';
import type { VideoEditorLibraryPanelProps } from '../../library/contracts/panel';
import { createHeaderController, createPreviewController } from './main.test-support';

const audioRecordingModalSpy = vi.fn();
const libraryPanelSpy = vi.fn<(props: VideoEditorLibraryPanelProps) => void>();
const inspectorSpy = vi.fn();
const previewSpy = vi.fn();
const timelineSpy = vi.fn();
const hookMocks = vi.hoisted(() => ({
  controller: null as unknown,
  sourceActive: false,
  setSourceActive: vi.fn(),
}));

function getHookController() {
  return hookMocks.controller as ReturnType<typeof createWorkspaceController>;
}

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useWorkspacePreviewContext: () => ({
    sourceViewerActive: hookMocks.sourceActive,
    setSourceViewerActive: hookMocks.setSourceActive,
  }),
  useVideoEditorBlockingOverlayContext: () => false,
  useVideoEditorHeaderController: () => getHookController().header,
  useVideoEditorHistoryController: () => getHookController().history,
  useVideoEditorLayoutController: () => getHookController().layout,
  useVideoEditorPreviewController: () => getHookController().preview,
  useVideoEditorSidebarController: () => getHookController().sidebar,
  useVideoEditorTimelineController: () => getHookController().timeline,
}));

vi.mock('../../runtime/controller/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/store')>()),
  useVideoEditorEffectEditingPort: (selector: (port: unknown) => unknown) =>
    selector({ applyEffectDocument: vi.fn() }),
}));

vi.mock('./effects-library', () => ({
  VideoEditorWorkspaceEffectsLibrary: () => <div data-testid="effects-library" />,
}));

vi.mock('../floating/inspector-stack', () => ({
  VideoEditorFloatingInspectorStack: (props: unknown) => {
    inspectorSpy(props);
    return <div data-testid="context-inspector" />;
  },
}));

vi.mock('../../library/panel', () => ({
  VideoEditorLibraryPanel: (props: VideoEditorLibraryPanelProps) => {
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
  PreviewStage: (props: { headerContent?: React.ReactNode; headerActions?: React.ReactNode }) => {
    previewSpy(props);
    return (
      <div data-testid="preview">
        {props.headerContent}
        {props.headerActions}
      </div>
    );
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
    history: {
      canUndo: false,
      canRedo: false,
      error: null,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    },
    layout: createLayoutController(),
    preview: createPreviewController(),
    sidebar: createSidebarController(projectActions),
    timeline: createTimelineController(),
  };
}

function createLayoutController() {
  return {
    audioRecordingDialogOpen: false,
    audioRecordingTarget: null as { projectId: string; trackId: string; startTime: number } | null,
    openTrackAudioRecordingDialog: vi.fn(),
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
    onAddLibraryMedia: vi.fn(async () => undefined),
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
    onUpdateCursorSkin: vi.fn(),
  };
}

function createSidebarState() {
  return {
    activeProjectId: 'project-1',
    collapsed: true,
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
    project: { ...createEmptyVideoProject('Workspace'), id: 'project-1' },
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
    project: { ...createEmptyVideoProject('Workspace'), id: 'project-1' },
    selection: { kind: 'scene' },
    selectedClipId: 'clip-1',
    selectedTrackId: 'track-1',
    timelinePreviews: {
      'clip-1': { kind: 'image', url: 'blob:image' },
    },
  };
}

function expectWorkspaceMarkup(markup: string) {
  expect(markup).toContain('video-editor.workspace.canvas-shell');
  expect(markup).not.toContain('pt-[4.75rem]');
  expect(markup).toContain('flex-1 p-3');
  expect(markup).not.toContain('pr-[21.75rem]');
  expect(markup).not.toContain('max-[860px]:pt-[11.75rem]');
  expect(markup).toContain('data-inspector-dock="viewer"');
  expect(markup).toContain('grid-template-rows:');
  expect(markup).toContain('video-editor.workspace.timeline-resize-zone');
  expect(markup).toContain('h-2 shrink-0 cursor-row-resize');
  expect(markup).not.toContain('h-1.5 w-full rounded-full');
  expect(markup).not.toContain('pl-[4.75rem]');
}

function verifyWorkspaceMainRouting() {
  hookMocks.controller = createWorkspaceController();
  const markup = renderToStaticMarkup(
    <VideoEditorWorkspaceMain previewHeightStyle={{ height: '280px' }} />
  );

  expect(markup).not.toContain('data-ui="video-editor.floating-workspace"');
  expect(markup).toContain('video-editor.library-tab.effects');
  expect(inspectorSpy.mock.calls[0]?.[0]).not.toHaveProperty('diagnosticsContent');
  expect(markup).toContain('data-ui="video-editor.workspace.upper"');
  expect(markup).not.toContain('pr-[calc(var(--video-editor-inspector-width)');
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
      'clip-1': { kind: 'image', url: 'blob:image' },
    },
  });
  expectWorkspaceMarkup(markup);
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('VideoEditorWorkspaceMain', () => {
  afterEach(() => {
    inspectorSpy.mockReset();
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

it('releases Source input ownership when Undo removes its source asset', async () => {
  hookMocks.controller = createWorkspaceController();
  hookMocks.sourceActive = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<VideoEditorWorkspaceMain previewHeightStyle={{}} />);
    });
    expect(hookMocks.setSourceActive).toHaveBeenCalledWith(false);
  } finally {
    act(() => root.unmount());
    hookMocks.sourceActive = false;
    hookMocks.setSourceActive.mockClear();
  }
});

it('continues measuring the visible frame after switching projects', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let frameWidth = 1280;
  const observers: Array<{ target: Element | null; notify: () => void }> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry: { target: Element | null; notify: () => void };
      constructor(notify: () => void) {
        this.entry = { target: null, notify };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.target = null;
      }
    }
  );
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({
      width: frameWidth,
      height: 720,
      top: 0,
      bottom: 720,
      left: 0,
      right: frameWidth,
      x: 0,
      y: 0,
      toJSON() {},
    }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () => root.render(<VideoEditorWorkspaceMain previewHeightStyle={{}} />);
  try {
    hookMocks.controller = createWorkspaceController();
    await act(async () => render());
    expect(inspectorSpy.mock.lastCall?.[0].resize.max).toBe(360);
    const next = createWorkspaceController();
    (
      next.timeline as unknown as { state: ReturnType<typeof createTimelineState> }
    ).state.project.id = 'project-2';
    hookMocks.controller = next;
    await act(async () => render());
    frameWidth = 1920;
    act(() =>
      observers.forEach(({ target, notify }) => {
        if (target?.isConnected) notify();
      })
    );
    expect(inspectorSpy.mock.lastCall?.[0].resize.max).toBe(520);
    frameWidth = 1280;
    act(() =>
      observers.forEach(({ target, notify }) => {
        if (target?.isConnected) notify();
      })
    );
    expect(inspectorSpy.mock.lastCall?.[0].resize.max).toBe(360);
  } finally {
    act(() => root.unmount());
    container.remove();
    bounds.mockRestore();
  }
});

it('routes library media insertion to the awaited materials command', async () => {
  const actions = createSidebarProjectActions();
  hookMocks.controller = {
    ...createWorkspaceController(),
    sidebar: createSidebarController(actions),
  };
  libraryPanelSpy.mockClear();
  renderToStaticMarkup(<VideoEditorWorkspaceMain previewHeightStyle={{}} />);
  const props = libraryPanelSpy.mock.calls[0]![0];
  await props.onAddMedia('library-image');
  expect(actions.onAddLibraryMedia).toHaveBeenCalledWith('library-image');
});

it('binds the recording modal save to the captured track destination', async () => {
  const controller = createWorkspaceController();
  const target = { projectId: 'project', trackId: 'voice', startTime: 7 };
  controller.layout.audioRecordingTarget = target;
  hookMocks.controller = controller;
  renderToStaticMarkup(<VideoEditorWorkspaceMain previewHeightStyle={{}} />);
  const props = audioRecordingModalSpy.mock.lastCall![0];
  const file = new File(['voice'], 'voice.webm');
  const trim = { trimStart: 1, trimEnd: 4 };
  await props.onSave(file, trim);
  expect(
    (
      controller.sidebar as unknown as {
        projectActions: ReturnType<typeof createSidebarProjectActions>;
      }
    ).projectActions.onImportRecordedAudio
  ).toHaveBeenCalledWith(file, trim, target);
});
