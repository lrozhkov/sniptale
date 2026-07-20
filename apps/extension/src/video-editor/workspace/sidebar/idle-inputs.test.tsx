// @vitest-environment jsdom

import { act } from 'react';
import { createRef } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PROJECT_AUDIO_ACCEPT_ATTRIBUTE,
  PROJECT_IMAGE_ACCEPT_ATTRIBUTE,
  PROJECT_VIDEO_ACCEPT_ATTRIBUTE,
} from '../../project/operations/import-validation';
import type { WorkspaceSidebarProps } from './contracts/props';

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
  WorkspaceSidebarPanelContent: () => <div data-ui="workspace-panel-content" />,
}));

import { WorkspaceSidebarExpandedPanel } from './shell';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

it('keeps hidden file inputs mounted and quiet across idle sidebar rerenders', () => {
  const inputRefs = {
    audioInputRef: createRef<HTMLInputElement>(),
    imageInputRef: createRef<HTMLInputElement>(),
    videoInputRef: createRef<HTMLInputElement>(),
  };
  const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
  const props = createBaseProps();

  renderPanel(props, inputRefs, 'Selection');
  const initialInputs = querySidebarInputs();

  renderPanel({ ...props, diagnosticsOpen: true }, inputRefs, 'Selection updated');
  const rerenderedInputs = querySidebarInputs();

  expect(rerenderedInputs).toEqual(initialInputs);
  expect(clickSpy).not.toHaveBeenCalled();
});

it('routes selected files through sidebar hidden inputs and clears the input value', () => {
  const inputRefs = {
    audioInputRef: createRef<HTMLInputElement>(),
    imageInputRef: createRef<HTMLInputElement>(),
    videoInputRef: createRef<HTMLInputElement>(),
  };
  const props = createBaseProps();

  renderPanel(props, inputRefs, 'Selection');
  dispatchFileChange(
    PROJECT_IMAGE_ACCEPT_ATTRIBUTE,
    new File(['image'], 'image.png', { type: 'image/png' })
  );
  dispatchFileChange(
    PROJECT_VIDEO_ACCEPT_ATTRIBUTE,
    new File(['video'], 'clip.webm', { type: 'video/webm' })
  );
  dispatchFileChange(
    PROJECT_AUDIO_ACCEPT_ATTRIBUTE,
    new File(['audio'], 'sound.webm', { type: 'audio/webm' })
  );

  expect(props.onImportImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'image.png' }));
  expect(props.onImportVideo).toHaveBeenCalledWith(expect.objectContaining({ name: 'clip.webm' }));
  expect(props.onImportAudio).toHaveBeenCalledWith(expect.objectContaining({ name: 'sound.webm' }));
});

function renderPanel(
  props: WorkspaceSidebarProps,
  inputRefs: React.ComponentProps<typeof WorkspaceSidebarExpandedPanel>['inputRefs'],
  selectionTitle: string
) {
  act(() => {
    root?.render(
      <WorkspaceSidebarExpandedPanel
        {...props}
        diagnosticsMeta="Diagnostics"
        projectsOpen
        recordingsOpen={false}
        diagnosticsSectionOpen={props.diagnosticsOpen}
        inputRefs={inputRefs}
        selectionIcon={<span>icon</span>}
        selectionTitle={selectionTitle}
        onToggleProjectsOpen={vi.fn()}
        onToggleRecordingsOpen={vi.fn()}
        onToggleDiagnosticsSection={vi.fn()}
      />
    );
  });
}

function querySidebarInputs(): HTMLInputElement[] {
  return Array.from(
    container?.querySelectorAll<HTMLInputElement>(
      '[data-frame="video-editor.workspace.sidebar-shell"] input[type="file"]'
    ) ?? []
  );
}

function dispatchFileChange(accept: string, file: File) {
  const input = container?.querySelector<HTMLInputElement>(`input[accept="${accept}"]`);
  if (!input) {
    throw new Error(`Missing input for ${accept}`);
  }

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  Object.defineProperty(input, 'value', {
    configurable: true,
    value: 'selected',
    writable: true,
  });

  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(input.value).toBe('');
}

function createBaseProps(): WorkspaceSidebarProps {
  return {
    activeProjectId: 'project-1',
    collapsed: false,
    diagnosticsContent: null,
    diagnosticsOpen: false,
    gridSettings: {
      color: '#94a3b8',
      enabled: false,
      onSetColor: vi.fn(),
      onSetEnabled: vi.fn(),
      onSetSize: vi.fn(),
      onSetSnapEnabled: vi.fn(),
      size: 80,
      snapEnabled: true,
    },
    inspectorMode: 'selection',
    project: {} as WorkspaceSidebarProps['project'],
    projects: [],
    recordingId: null,
    recordings: [],
    selectedClip: null,
    selectedTrack: null,
    ...createActionProps(),
  };
}

function createActionProps() {
  return {
    onAddActionEvent: vi.fn(),
    onAddRecording: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImportAudio: vi.fn(),
    onImportImage: vi.fn(),
    onImportVideo: vi.fn(),
    onOpenProject: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onToggleDiagnostics: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
  };
}
