// @vitest-environment jsdom

import { createRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { WorkspaceSidebarProps } from './contracts/props';

const { inputNodesMock, panelContentMock, railProps } = vi.hoisted(() => ({
  inputNodesMock: vi.fn((props: unknown) => props),
  panelContentMock: vi.fn((props: unknown) => props),
  railProps: { current: null as null | Record<string, unknown> },
}));

vi.mock('@sniptale/ui/inspector-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/ui/inspector-shell')>();
  return {
    ...actual,
    InspectorShellFrame: ({ children, dataUi }: { children: React.ReactNode; dataUi?: string }) => (
      <div data-frame={dataUi}>{children}</div>
    ),
    InspectorShellPanel: ({ children, dataUi }: { children: React.ReactNode; dataUi?: string }) => (
      <section data-panel={dataUi}>{children}</section>
    ),
    INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS: 'collapsed',
    INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS: 'expanded',
  };
});

vi.mock('../../chrome/file-inputs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../chrome/file-inputs')>();
  return {
    ...actual,
    VideoEditorFileInputNodes: (props: unknown) => {
      inputNodesMock(props);
      return null;
    },
  };
});

vi.mock('./libraries', () => ({
  WorkspaceSidebarCollapsedRail: (props: Record<string, (() => void) | unknown>) => {
    railProps.current = props;
    return <div data-ui="collapsed-rail" />;
  },
  WorkspaceSidebarImportToolbar: () => <div data-ui="import-toolbar" />,
  WorkspaceSidebarLibraryPanels: () => <div data-ui="library-panels" />,
}));

vi.mock('./view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./view')>();
  return {
    ...actual,
    WorkspaceSidebarHeader: ({ selectionTitle }: { selectionTitle: string }) => (
      <div data-ui="workspace-header">{selectionTitle}</div>
    ),
  };
});

vi.mock('./panel-content/index', () => ({
  WorkspaceSidebarPanelContent: (props: unknown) => {
    panelContentMock(props);
    return <div data-ui="workspace-panel-content" />;
  },
}));

import { WorkspaceSidebarCollapsedShell, WorkspaceSidebarExpandedPanel } from './shell';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
}

function createBaseProps(): WorkspaceSidebarProps {
  return {
    ...createBaseStateProps(),
    ...createBaseActionProps(),
  };
}

function createBaseStateProps() {
  return {
    project: createEmptyVideoProject('Sidebar project'),
    activeProjectId: 'project-1',
    selectedClip: null,
    selectedTrack: null,
    recordingId: null,
    diagnosticsOpen: false,
    diagnosticsContent: null,
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
    inspectorMode: 'selection' as const,
    projects: [],
    recordings: [],
    collapsed: false,
  };
}

function createBaseActionProps() {
  return {
    onToggleCollapsed: vi.fn(),
    onOpenProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onAddRecording: vi.fn(),
    onAddActionEvent: vi.fn(),
    onImportImage: vi.fn(),
    onImportVideo: vi.fn(),
    onImportAudio: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onResizeProject: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onToggleDiagnostics: vi.fn(),
  };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  railProps.current = null;
  vi.clearAllMocks();
});

function createMockInputRef(click: () => void): React.RefObject<HTMLInputElement | null> {
  const input = document.createElement('input');
  input.click = click;
  return { current: input };
}

it('wires collapsed rail import actions to the current file input refs', () => {
  const imageClick = vi.fn();
  const videoClick = vi.fn();
  const audioClick = vi.fn();
  const props = createBaseProps();

  renderNode(
    <WorkspaceSidebarCollapsedShell
      diagnosticsOpen={false}
      inputRefs={{
        imageInputRef: createMockInputRef(imageClick),
        videoInputRef: createMockInputRef(videoClick),
        audioInputRef: createMockInputRef(audioClick),
      }}
      selectedClipLabel="Selection"
      selectedClipIcon={<span>icon</span>}
      onToggleCollapsed={props.onToggleCollapsed}
      onCreateProject={props.onCreateProject}
      onImportImage={props.onImportImage}
      onImportVideo={props.onImportVideo}
      onImportAudio={props.onImportAudio}
      onToggleDiagnostics={() => props.onToggleDiagnostics(true)}
    />
  );

  (railProps.current?.['onImportImage'] as (() => void) | undefined)?.();
  (railProps.current?.['onImportVideo'] as (() => void) | undefined)?.();
  (railProps.current?.['onImportAudio'] as (() => void) | undefined)?.();

  expect(imageClick).toHaveBeenCalledOnce();
  expect(videoClick).toHaveBeenCalledOnce();
  expect(audioClick).toHaveBeenCalledOnce();
  expect(inputNodesMock).toHaveBeenCalledOnce();
});

it('renders the expanded shell frame and forwards panel content props', () => {
  const props = createBaseProps();
  const inputRefs = {
    imageInputRef: createRef<HTMLInputElement>(),
    videoInputRef: createRef<HTMLInputElement>(),
    audioInputRef: createRef<HTMLInputElement>(),
  };

  renderNode(
    <WorkspaceSidebarExpandedPanel
      {...props}
      diagnosticsMeta="Diagnostics"
      projectsOpen
      recordingsOpen={false}
      diagnosticsSectionOpen
      inputRefs={inputRefs}
      selectionIcon={<span>icon</span>}
      selectionTitle="Selection"
      onToggleProjectsOpen={vi.fn()}
      onToggleRecordingsOpen={vi.fn()}
      onToggleDiagnosticsSection={vi.fn()}
    />
  );

  expect(container?.querySelector('[data-frame="video-editor.workspace.sidebar-shell"]')).not.toBe(
    null
  );
  expect(container?.querySelector('[data-panel="video-editor.workspace.sidebar-panel"]')).not.toBe(
    null
  );
  expect(panelContentMock).toHaveBeenCalledOnce();
  expect(panelContentMock.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      diagnosticsMeta: 'Diagnostics',
      inputRefs,
      selectedTrack: null,
    })
  );
});
