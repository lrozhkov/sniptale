// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../capture', () => ({
  ToolbarCaptureActions: (props: {
    displayMode: string;
    onPinToTabChange: () => void;
    pinToTab: boolean;
    pinToTabLocked: boolean;
    scenario?: unknown;
  }) => (
    <div
      data-ui="test.capture-actions"
      data-display-mode={props.displayMode}
      data-pin-to-tab={props.pinToTab ? 'true' : 'false'}
      data-pin-to-tab-locked={props.pinToTabLocked ? 'true' : 'false'}
      data-scenario={props.scenario ? 'true' : 'false'}
    />
  ),
}));

vi.mock('../scenario/controls', () => ({
  ToolbarScenarioControls: (props: { showWorkflowActions?: boolean }) => (
    <div
      data-ui="test.scenario-controls"
      data-workflow-actions={props.showWorkflowActions ? 'true' : 'false'}
    />
  ),
}));

vi.mock('./utilities', () => ({
  ToolbarUtilityButtons: (props: { highlighterMode: boolean; isCursorMode: boolean }) => (
    <div
      data-ui="test.utility-buttons"
      data-highlighter-mode={props.highlighterMode ? 'true' : 'false'}
      data-is-cursor-mode={props.isCursorMode ? 'true' : 'false'}
    />
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

function createToolbarProps(params?: { isCursorMode?: boolean }) {
  return {
    aiPickMode: false,
    currentViewport: null,
    framesCount: 0,
    ...(params?.isCursorMode === undefined ? {} : { isCursorMode: params.isCursorMode }),
    onPinToTabChange: vi.fn(),
    onAiPickContentStart: vi.fn(),
    onCaptureActionChange: vi.fn(),
    onClearHighlights: vi.fn(),
    onDisableAiPickMode: vi.fn(),
    onEnableCursorMode: vi.fn(),
    onHide: vi.fn(),
    onTakeScreenshot: vi.fn(),
    onTimerDelayChange: vi.fn(),
    onToggleHighlighterMode: vi.fn(),
    onToggleNavigationLock: vi.fn(),
    onToggleQuickEditDocumentMode: vi.fn(),
    onToggleQuickEditMode: vi.fn(),
    onToggleScreenshotMode: vi.fn(),
    pinToTab: true,
    pinToTabLocked: false,
    quickEditMode: false,
    screenshotMode: true,
    scenario: {
      captureMode: 'manual' as const,
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
    },
    timerDelay: 0,
  };
}

function createViewModel(params: {
  captureAction: 'download_default' | 'scenario';
  highlighterMode?: boolean;
  pendingInteractionMode?: 'quick-edit' | 'highlighter' | null;
}) {
  return {
    captureAction: params.captureAction,
    derivedState: {
      currentViewport: null,
      displayMode: 'vertical' as const,
      isLoading: false,
      lockDisabled: false,
      navigationLockEnabled: false,
      setDisplayMode: vi.fn(),
      toggleNavigationLock: vi.fn(),
    },
    ...(params.highlighterMode === undefined
      ? { highlighterMode: false }
      : { highlighterMode: params.highlighterMode }),
    ...(params.pendingInteractionMode === undefined
      ? { pendingInteractionMode: null }
      : { pendingInteractionMode: params.pendingInteractionMode }),
    quickEditMode: false,
    quickEditDocumentMode: false,
    screenshotMode: true,
    setCaptureAction: vi.fn(),
    toggleMode: vi.fn(),
  };
}

async function renderSecondaryControls(params: {
  captureAction: 'download_default' | 'scenario';
  highlighterMode?: boolean;
  isCursorMode?: boolean;
  pendingInteractionMode?: 'quick-edit' | 'highlighter' | null;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const { ToolbarSecondaryControls } = await import('./secondary');

  act(() => {
    root?.render(
      <ToolbarSecondaryControls
        toolbarProps={
          createToolbarProps(
            params.isCursorMode === undefined ? undefined : { isCursorMode: params.isCursorMode }
          ) as never
        }
        viewModel={
          createViewModel({
            captureAction: params.captureAction,
            ...(params.highlighterMode === undefined
              ? {}
              : { highlighterMode: params.highlighterMode }),
            ...(params.pendingInteractionMode === undefined
              ? {}
              : { pendingInteractionMode: params.pendingInteractionMode }),
          }) as never
        }
        onViewportChange={() => undefined}
      />
    );
  });
}

function readOrderedDataUi(): Array<string | null> {
  return Array.from(document.querySelectorAll('[data-ui]')).map((node) =>
    node.getAttribute('data-ui')
  );
}

function expectScenarioControlsBeforeUtilityAndCapture(): void {
  const orderedDataUi = readOrderedDataUi();

  expect(document.querySelector('[data-ui="test.scenario-controls"]')).not.toBeNull();
  expect(
    document
      .querySelector('[data-ui="test.scenario-controls"]')
      ?.getAttribute('data-workflow-actions')
  ).toBe('false');
  expect(orderedDataUi.indexOf('test.scenario-controls')).toBeLessThan(
    orderedDataUi.indexOf('test.utility-buttons')
  );
  expect(orderedDataUi.indexOf('test.utility-buttons')).toBeLessThan(
    orderedDataUi.indexOf('test.capture-actions')
  );
}

async function verifiesScenarioCaptureForwarding() {
  await renderSecondaryControls({ captureAction: 'download_default' });
  expect(
    document.querySelector('[data-ui="test.capture-actions"]')?.getAttribute('data-scenario')
  ).toBe('false');

  await renderSecondaryControls({ captureAction: 'scenario' });
  expect(
    document.querySelector('[data-ui="test.capture-actions"]')?.getAttribute('data-scenario')
  ).toBe('true');
}

async function verifiesCompactScenarioControlOrder() {
  await renderSecondaryControls({ captureAction: 'scenario', isCursorMode: true });
  expectScenarioControlsBeforeUtilityAndCapture();

  await renderSecondaryControls({ captureAction: 'scenario', isCursorMode: false });

  expect(document.querySelector('[data-ui="test.scenario-controls"]')).toBeNull();
}

async function verifiesModeDependentUtilityVisibility() {
  await renderSecondaryControls({
    captureAction: 'download_default',
    highlighterMode: true,
    isCursorMode: false,
  });

  expect(
    document
      .querySelector('[data-ui="test.utility-buttons"]')
      ?.getAttribute('data-highlighter-mode')
  ).toBe('true');
  expect(
    document.querySelector('[data-ui="test.utility-buttons"]')?.getAttribute('data-is-cursor-mode')
  ).toBe('false');
  expect(
    document.querySelector('[data-ui="test.capture-actions"]')?.getAttribute('data-display-mode')
  ).toBe('vertical');
  expect(
    document.querySelector('[data-ui="test.capture-actions"]')?.getAttribute('data-pin-to-tab')
  ).toBe('true');
  expect(
    document
      .querySelector('[data-ui="test.capture-actions"]')
      ?.getAttribute('data-pin-to-tab-locked')
  ).toBe('false');
}

async function verifiesPendingQuickEditSuppressesCursorUtilities() {
  await renderSecondaryControls({
    captureAction: 'download_default',
    isCursorMode: true,
    pendingInteractionMode: 'quick-edit',
  });

  expect(
    document.querySelector('[data-ui="test.utility-buttons"]')?.getAttribute('data-is-cursor-mode')
  ).toBe('false');
  expect(
    document
      .querySelector('[data-ui="test.utility-buttons"]')
      ?.getAttribute('data-highlighter-mode')
  ).toBe('false');
}

describe('ToolbarSecondaryControls', () => {
  it(
    'passes scenario props to capture actions only when after-capture action is scenario',
    verifiesScenarioCaptureForwarding
  );
  it(
    'renders compact scenario controls before utility buttons in cursor scenario mode',
    verifiesCompactScenarioControlOrder
  );
  it(
    'forwards mode-dependent utility visibility and persisted display mode state',
    verifiesModeDependentUtilityVisibility
  );
  it(
    'suppresses cursor-only utility controls while a quick-edit transition is pending',
    verifiesPendingQuickEditSuppressesCursorUtilities
  );
});
