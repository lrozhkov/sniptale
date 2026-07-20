// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarPrimaryControls } from './primary';
import { useToolbarMenuState } from '../state/menu';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: vi.fn(),
  },
  runtimeInfo: {
    getContexts: vi.fn(),
    getLastError: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
    getURL: vi.fn(),
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type ToolbarPrimaryControlsProps = React.ComponentProps<typeof ToolbarPrimaryControls>;
type ToolbarPrimaryFixtureParams = {
  aiPickMode?: boolean;
  captureAction?: 'download_default' | 'scenario';
  highlighterMode?: boolean;
  isCursorMode?: boolean;
  pendingInteractionMode?: 'quick-edit' | 'highlighter' | null;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  screenshotMode?: boolean;
};
type ToolbarPrimaryHarnessProps = {
  fixtureParams: ToolbarPrimaryFixtureParams;
  toolbarProps: ToolbarPrimaryControlsProps['toolbarProps'];
  toggleMode: ToolbarPrimaryControlsProps['viewModel']['toggleMode'];
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createScenarioState() {
  return {
    byClickDisabled: false,
    captureMode: 'manual' as const,
    enabled: true,
    onCaptureActionSelected: vi.fn(),
    onCreateProject: vi.fn(),
    onFinishScenario: vi.fn(),
    onOpenEditor: vi.fn(),
    onProjectSelect: vi.fn(),
    onRememberProjectSelectionChange: vi.fn(),
    onSetCaptureMode: vi.fn(),
    onToggleSidebar: vi.fn(),
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    projects: [],
    rememberProjectSelection: false,
    sidebarVisible: true,
  };
}

function createToolbarPrimaryToolbarProps(params: ToolbarPrimaryFixtureParams) {
  return {
    aiPickMode: params.aiPickMode ?? false,
    isCursorMode: params.isCursorMode ?? true,
    onAiPickContentStart: vi.fn(),
    onClearHighlights: vi.fn(),
    onDisableAiPickMode: vi.fn(),
    onEnableCursorMode: vi.fn(),
    onHide: vi.fn(),
    onTakeScreenshot: vi.fn(),
    onTimerDelayChange: vi.fn(),
    onToggleHighlighterMode: vi.fn(),
    onToggleQuickEditDocumentMode: vi.fn(),
    onToggleQuickEditMode: vi.fn(),
    onToggleScreenshotMode: vi.fn(),
    scenario: createScenarioState(),
    timerDelay: 0,
  };
}

function createToolbarPrimaryViewModel(
  params: ToolbarPrimaryFixtureParams,
  toggleMode: ToolbarPrimaryControlsProps['viewModel']['toggleMode'],
  toolbarMenuState: ToolbarPrimaryControlsProps['viewModel']['toolbarMenuState']
): ToolbarPrimaryControlsProps['viewModel'] {
  return {
    quickEditMode: params.quickEditMode ?? false,
    quickEditDocumentMode: params.quickEditDocumentMode ?? false,
    highlighterMode: params.highlighterMode ?? false,
    pendingInteractionMode: params.pendingInteractionMode ?? null,
    screenshotMode: params.screenshotMode ?? true,
    captureAction: params.captureAction ?? 'download_default',
    setCaptureAction: vi.fn(),
    derivedState: {
      compactMenus: false,
      currentViewport: null,
      displayMode: 'horizontal',
      handleMouseDown: vi.fn(),
      isDragging: false,
      isLoading: false,
      lockDisabled: false,
      lockTitle: '',
      navigationLockEnabled: false,
      position: { x: 0, y: 0 },
      positionReady: true,
      setCompactMenus: vi.fn(),
      setCurrentViewport: vi.fn(),
      setDisplayMode: vi.fn(),
      setIsLoading: vi.fn(),
      toolbarRef: { current: null },
      toggleNavigationLock: vi.fn(),
    },
    toolbarMenuState,
    toggleMode,
  };
}

function createToolbarPrimaryControlsProps(params?: ToolbarPrimaryFixtureParams) {
  const resolvedParams = params ?? {};
  const toggleMode = vi.fn<ToolbarPrimaryControlsProps['viewModel']['toggleMode']>(
    async () => undefined
  );

  return {
    toggleMode,
    props: {
      fixtureParams: resolvedParams,
      toolbarProps: createToolbarPrimaryToolbarProps(resolvedParams),
      toggleMode,
    },
  };
}

function renderToolbarPrimaryControls(props: ToolbarPrimaryHarnessProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ToolbarPrimaryControlsHarness {...props} />);
  });
}

function ToolbarPrimaryControlsHarness(props: ToolbarPrimaryHarnessProps) {
  const toolbarMenuState = useToolbarMenuState();
  const typedProps: ToolbarPrimaryControlsProps = {
    toolbarProps: props.toolbarProps,
    viewModel: createToolbarPrimaryViewModel(
      props.fixtureParams,
      props.toggleMode,
      toolbarMenuState
    ),
  };

  return <ToolbarPrimaryControls {...typedProps} />;
}

function queryModeSelectorButton(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.mode-selector-button"]');
}

function queryQuickEditDocumentModeButton(): HTMLButtonElement | null {
  return document.querySelector('[data-ui="content.toolbar.quick-edit-document-mode-button"]');
}

function openModeMenu(button: HTMLButtonElement | null): void {
  act(() => {
    button?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

function expectModeMenuIcon(mode: 'ai' | 'quick-edit'): void {
  const icon = document.querySelector(
    `[data-ui="content.toolbar.mode-option.${mode}"] svg`
  ) as SVGElement | null;

  expect(icon?.getAttribute('width')).toBe('18');
  expect(icon?.getAttribute('height')).toBe('18');
  expect(icon?.getAttribute('class')).toContain('sniptale-toolbar-mode-icon');
}

describe('ToolbarPrimaryControls', () => {
  it('keeps the mode selector neutral in cursor mode and active in editing modes', async () => {
    const inactive = createToolbarPrimaryControlsProps();
    renderToolbarPrimaryControls(inactive.props);

    const modeButton = queryModeSelectorButton();

    expect(modeButton?.getAttribute('data-active')).toBe('true');
    expect(modeButton?.getAttribute('title')).toBe('Стандартный');

    const active = createToolbarPrimaryControlsProps({ aiPickMode: true, isCursorMode: false });
    renderToolbarPrimaryControls(active.props);

    const activeModeButton = document.querySelector(
      '[data-ui="content.toolbar.mode-selector-button"]'
    ) as HTMLButtonElement | null;

    expect(activeModeButton?.getAttribute('data-active')).toBe('true');
    expect(activeModeButton?.getAttribute('title')).toBe('ИИ-редактор');
  });

  it('keeps scenario controls out of the primary group', async () => {
    const scenarioCursor = createToolbarPrimaryControlsProps({
      captureAction: 'scenario',
      isCursorMode: true,
      screenshotMode: true,
    });
    renderToolbarPrimaryControls(scenarioCursor.props);

    expect(document.querySelector('[data-ui="test.scenario-controls"]')).toBeNull();
  });

  it('keeps AI and quick edit mode icons pinned to toolbar icon size inside the mode menu', async () => {
    const rendered = createToolbarPrimaryControlsProps();
    renderToolbarPrimaryControls(rendered.props);

    openModeMenu(queryModeSelectorButton());
    expectModeMenuIcon('ai');
    expectModeMenuIcon('quick-edit');
  });
});

describe('ToolbarPrimaryControls pending mode', () => {
  it('shows the pending editing mode instead of falling back to cursor while a toggle is in flight', async () => {
    const rendered = createToolbarPrimaryControlsProps({
      isCursorMode: true,
      pendingInteractionMode: 'quick-edit',
    });
    renderToolbarPrimaryControls(rendered.props);

    const modeButton = queryModeSelectorButton();

    expect(modeButton?.getAttribute('data-active')).toBe('true');
    expect(modeButton?.getAttribute('title')).toBe('Редактирование страницы');
  });
});

describe('ToolbarPrimaryControls quick-edit document mode', () => {
  it('shows the document-mode button only while quick edit is active', async () => {
    const inactive = createToolbarPrimaryControlsProps();
    renderToolbarPrimaryControls(inactive.props);

    expect(queryQuickEditDocumentModeButton()).toBeNull();

    const active = createToolbarPrimaryControlsProps({ quickEditMode: true });
    renderToolbarPrimaryControls(active.props);

    expect(queryQuickEditDocumentModeButton()?.getAttribute('title')).toBe(
      'Редактировать текст прямо на странице'
    );
  });

  it('reflects document-mode active state and requests the next state on click', async () => {
    const rendered = createToolbarPrimaryControlsProps({
      quickEditDocumentMode: true,
      quickEditMode: true,
    });
    renderToolbarPrimaryControls(rendered.props);

    const button = queryQuickEditDocumentModeButton();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(button?.getAttribute('data-active')).toBe('true');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('title')).toBe('Выключить свободное редактирование');
    expect(rendered.props.toolbarProps.onToggleQuickEditDocumentMode).toHaveBeenCalledWith(false);
  });
});
