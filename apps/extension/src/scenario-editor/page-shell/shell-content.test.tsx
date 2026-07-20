// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { SCENARIO_EDITOR_MODES } from './presentation/mode';
import { ScenarioV3EditorShellContent } from './shell-content';
import {
  createScenarioV3ClipboardData,
  createScenarioV3ClipboardEvent,
  createScenarioV3LayerClipboardProject,
  createScenarioV3ShellContentEditorStub,
} from './test-support';
const { deckExportMountPropsMock, workspacePropsMock } = vi.hoisted(() => ({
  deckExportMountPropsMock: vi.fn(),
  workspacePropsMock: vi.fn(),
}));
vi.mock('../project/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project/ai')>()),
  createScenarioEditorDeckAiSubmitAction: vi.fn(() => vi.fn()),
}));
vi.mock('../project/ai/deck-panel', () => ({
  ScenarioEditorDeckAiPanel: () => <div data-testid="ai-panel" />,
}));
vi.mock('./deck-export-dialog-mount', () => ({
  ScenarioV3DeckExportDialogMount: (props: { open: boolean }) => {
    deckExportMountPropsMock(props);
    return props.open ? <div data-testid="deck-export-dialog" /> : null;
  },
}));
vi.mock('../project/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project/templates')>()),
  ScenarioTemplateManager: () => <div data-testid="template-manager" />,
}));
vi.mock('./image-editor', () => ({
  ScenarioImageElementEditorMount: () => null,
}));
vi.mock('./workspace', () => ({
  ScenarioV3Workspace: (props: { audienceOpening: boolean }) => {
    workspacePropsMock(props);
    return <div data-audience-opening={String(props.audienceOpening)} data-testid="workspace" />;
  },
}));
let container: HTMLDivElement | null = null;
let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ScenarioV3EditorShellContent', () => {
  registerWorkspaceStateTests();
  registerMountedPanelTests();
  registerTemplatePickerTests();
  registerLayerClipboardTests();
});

function registerWorkspaceStateTests() {
  it('passes audience launch state into workspace and surfaces presentation errors', () => {
    renderContent({ audienceOpening: true, presentationError: 'Audience failed' });

    expect(
      container?.querySelector('[data-testid="workspace"]')?.getAttribute('data-audience-opening')
    ).toBe('true');
    expect(container?.textContent).toContain('Audience failed');
  });

  it('passes canvas viewport controls and floating callbacks into the workspace', () => {
    renderContent();

    const editWorkspaceProps = getLastMockArg<{
      canvasViewport: { controls: object; viewportInsets?: { left: number } };
      onOpenExport: () => void;
      onToggleAi: () => void;
    }>(workspacePropsMock);

    expect(editWorkspaceProps.canvasViewport.controls).toBeTruthy();
    expect(editWorkspaceProps.canvasViewport.viewportInsets?.left).toBe(304);
    act(() => {
      editWorkspaceProps.onOpenExport();
      editWorkspaceProps.onToggleAi();
    });

    renderContent({ mode: SCENARIO_EDITOR_MODES.play });

    const playWorkspaceProps = getLastMockArg<{
      canvasViewport: { controls: object };
    }>(workspacePropsMock);

    expect(playWorkspaceProps.canvasViewport.controls).toBeTruthy();
  });
}

function registerMountedPanelTests() {
  it('renders mounted panels and opens the page shell export dialog mount', () => {
    renderContent({
      aiPanelOpen: true,
      exportDialogOpen: true,
      templates: createTemplates({ panelMode: 'manager' }),
    });

    const workspaceProps = getLastMockArg<{ aiPanelOpen: boolean }>(workspacePropsMock);
    const deckExportMountProps = getLastMockArg<{ open: boolean }>(deckExportMountPropsMock);

    expect(container?.querySelector('[data-testid="ai-panel"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="deck-export-dialog"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="template-manager"]')).not.toBeNull();
    expect(workspaceProps.aiPanelOpen).toBe(true);
    expect(deckExportMountProps.open).toBe(true);
  });
}

function registerTemplatePickerTests() {
  it('passes right rail template picker state into the workspace seam', () => {
    renderContent();
    const workspaceProps = getLastMockArg<{
      onToggleTemplatePicker: () => void;
      templatePickerOpen: boolean;
    }>(workspacePropsMock);

    act(() => workspaceProps.onToggleTemplatePicker());

    expect(
      getLastMockArg<{ templatePickerOpen: boolean }>(workspacePropsMock).templatePickerOpen
    ).toBe(true);
  });
}

function registerLayerClipboardTests() {
  it('copies the selected layer and pastes it into the active slide', () => {
    const scenario = copyAndPasteSelectedScenarioLayer();

    expect(scenario.copyEvent.defaultPrevented).toBe(true);
    expect(scenario.pasteEvent.defaultPrevented).toBe(true);
    expect(scenario.applyProject).toHaveBeenCalledWith(
      expect.objectContaining({
        slides: expect.arrayContaining([
          expect.objectContaining({
            elements: [
              expect.objectContaining({
                id: 'element-00000000-0000-4000-8000-000000000003',
                text: 'Layer',
              }),
            ],
            id: 'slide-2',
          }),
        ]),
      })
    );
    expect(scenario.selectElement).toHaveBeenCalledWith(
      'element-00000000-0000-4000-8000-000000000003'
    );
  });
}

function copyAndPasteSelectedScenarioLayer() {
  vi.spyOn(Date, 'now').mockReturnValue(700);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000003');
  const project = createScenarioV3LayerClipboardProject();
  const applyProject = vi.fn<(project: ScenarioProjectV3) => void>();
  const selectElement = vi.fn<(elementId: string) => void>();
  const clipboardData = createScenarioV3ClipboardData();

  renderContent({
    editor: createScenarioV3ShellContentEditorStub({
      applyProject,
      project,
      selectedElementId: 'text-1',
      selectedSlideId: 'slide-1',
      selectElement,
    }),
  });
  const copyEvent = createScenarioV3ClipboardEvent('copy', clipboardData);
  act(() => window.dispatchEvent(copyEvent));
  const pasteEvent = pasteScenarioLayerIntoSecondSlide({
    applyProject,
    clipboardData,
    project,
    selectElement,
  });
  return {
    applyProject,
    copyEvent,
    pasteEvent,
    selectElement,
  };
}

function pasteScenarioLayerIntoSecondSlide(args: {
  applyProject: (project: ScenarioProjectV3) => void;
  clipboardData: Pick<DataTransfer, 'getData' | 'setData'>;
  project: ReturnType<typeof createScenarioV3LayerClipboardProject>;
  selectElement: (elementId: string) => void;
}) {
  renderContent({
    editor: createScenarioV3ShellContentEditorStub({
      applyProject: args.applyProject,
      project: args.project,
      selectedElementId: null,
      selectedSlideId: 'slide-2',
      selectElement: args.selectElement,
    }),
  });
  const pasteEvent = createScenarioV3ClipboardEvent('paste', args.clipboardData);
  act(() => window.dispatchEvent(pasteEvent));
  return pasteEvent;
}

function renderContent(
  overrides: Partial<Parameters<typeof ScenarioV3EditorShellContent>[0]> = {}
) {
  act(() => {
    root?.render(<ScenarioV3EditorShellContent {...createContentProps(overrides)} />);
  });
}

function createContentProps(
  overrides: Partial<Parameters<typeof ScenarioV3EditorShellContent>[0]>
): Parameters<typeof ScenarioV3EditorShellContent>[0] {
  const project = createScenarioProjectV3('Shell');
  const editor = createScenarioV3ShellContentEditorStub({ project });

  return {
    aiPanelOpen: false,
    aiState: {},
    audienceOpening: false,
    clickIndex: 0,
    editingImageElementId: null,
    editor,
    elapsedSeconds: 0,
    exportDialogOpen: false,
    mode: SCENARIO_EDITOR_MODES.edit,
    onClickIndexChange: vi.fn(),
    onCloseAi: vi.fn(),
    onCloseExport: vi.fn(),
    onCloseImageElement: vi.fn(),
    onEditImageElement: vi.fn(),
    onModeChange: vi.fn(),
    onOpenAudienceScreen: vi.fn(),
    onOpenExport: vi.fn(),
    onPresentationPositionChange: vi.fn(),
    onToggleAi: vi.fn(),
    presentationError: null,
    templates: createTemplates(),
    ...overrides,
  } as Parameters<typeof ScenarioV3EditorShellContent>[0];
}

function createTemplates(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    closePanel: vi.fn(),
    createSlide: vi.fn(),
    deleteLibrary: vi.fn(),
    libraries: [],
    openManager: vi.fn(),
    panelMode: null,
    saveLibrary: vi.fn(),
    templates: [],
    toggleLibrary: vi.fn(),
    ...overrides,
  };
}

function getLastMockArg<T>(mock: ReturnType<typeof vi.fn>): T {
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('Expected mock call');
  }
  return call[0] as T;
}
