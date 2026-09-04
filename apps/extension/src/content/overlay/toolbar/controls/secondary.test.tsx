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

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../capture', () => ({
  ToolbarCaptureActions: (props: {
    displayMode: string;
    onPinToTabChange: () => void;
    pinToTab: boolean;
    pinToTabAvailable: boolean;
    pinToTabLocked: boolean;
    scenario?: unknown;
  }) => (
    <div
      data-ui="test.capture-actions"
      data-display-mode={props.displayMode}
      data-pin-to-tab={props.pinToTab ? 'true' : 'false'}
      data-pin-to-tab-available={props.pinToTabAvailable ? 'true' : 'false'}
      data-pin-to-tab-locked={props.pinToTabLocked ? 'true' : 'false'}
      data-scenario={props.scenario ? 'true' : 'false'}
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

vi.mock('./design-review', () => ({
  ToolbarDesignReviewControls: (props: { panelOpen: boolean }) => (
    <div
      data-panel-open={props.panelOpen ? 'true' : 'false'}
      data-ui="test.design-review-controls"
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

function createToolbarProps(params?: { designReviewPanelOpen?: boolean; isCursorMode?: boolean }) {
  return {
    aiPickMode: false,
    currentViewport: null,
    framesCount: 0,
    designReviewPanelOpen: params?.designReviewPanelOpen ?? false,
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
    onToggleDesignReviewPanel: vi.fn(),
    onToggleNavigationLock: vi.fn(),
    onToggleQuickEditDocumentMode: vi.fn(),
    onToggleQuickEditMode: vi.fn(),
    onToggleScreenshotMode: vi.fn(),
    pinToTab: true,
    pinToTabAvailable: true,
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
  designReviewMode?: boolean;
  highlighterMode?: boolean;
  pendingInteractionMode?: 'quick-edit' | 'highlighter' | null;
}) {
  return {
    capture: {
      action: params.captureAction,
      setAction: vi.fn(),
    },
    designReviewMode: params.designReviewMode ?? false,
    derivedState: {
      compactMenus: false,
      currentViewport: null,
      displayMode: 'vertical' as const,
      isLoading: false,
      lockDisabled: false,
      navigationLockEnabled: false,
      setDisplayMode: vi.fn(),
      setCompactMenus: vi.fn(),
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
    toolbarMenuState: {
      activeMenuType: null,
      closeMenu: vi.fn(),
      closeMenus: vi.fn(),
      setActiveMenuType: vi.fn(),
      setShowCaptureMenu: vi.fn(),
      setShowTimerMenu: vi.fn(),
      setViewportMenuOpen: vi.fn(),
      showCaptureMenu: false,
      showTimerMenu: false,
      toggleMenu: vi.fn(),
      viewportMenuOpen: false,
    },
    toggleMode: vi.fn(),
  };
}

async function renderSecondaryControls(params: {
  captureAction: 'download_default' | 'scenario';
  designReviewMode?: boolean;
  designReviewPanelOpen?: boolean;
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
          createToolbarProps({
            ...(params.designReviewPanelOpen === undefined
              ? {}
              : { designReviewPanelOpen: params.designReviewPanelOpen }),
            ...(params.isCursorMode === undefined ? {} : { isCursorMode: params.isCursorMode }),
          }) as never
        }
        viewModel={
          createViewModel({
            captureAction: params.captureAction,
            ...(params.designReviewMode === undefined
              ? {}
              : { designReviewMode: params.designReviewMode }),
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

async function verifiesScenarioCaptureAcrossInteractionModes() {
  await renderSecondaryControls({ captureAction: 'scenario', isCursorMode: true });
  expect(
    document.querySelector('[data-ui="test.capture-actions"]')?.getAttribute('data-scenario')
  ).toBe('true');

  await renderSecondaryControls({
    captureAction: 'scenario',
    highlighterMode: true,
    isCursorMode: false,
  });
  expect(
    document.querySelector('[data-ui="test.capture-actions"]')?.getAttribute('data-scenario')
  ).toBe('true');
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

async function verifiesDesignReviewControls() {
  await renderSecondaryControls({
    captureAction: 'download_default',
    designReviewMode: true,
    designReviewPanelOpen: true,
  });
  expect(
    document
      .querySelector('[data-ui="test.design-review-controls"]')
      ?.getAttribute('data-panel-open')
  ).toBe('true');

  await renderSecondaryControls({ captureAction: 'download_default', designReviewMode: false });
  expect(document.querySelector('[data-ui="test.design-review-controls"]')).toBeNull();
}

describe('ToolbarSecondaryControls', () => {
  it('restores ordinary capture controls whenever another working mode conflicts with stale video state', async () => {
    const { shouldProjectVideoRecordingControls } = await import('./secondary');
    const recording = { state: { phase: 'idle' } };
    const baseViewModel = {
      designReviewMode: false,
      highlighterMode: false,
      quickEditMode: false,
    };
    expect(
      shouldProjectVideoRecordingControls(
        {
          videoRecordingMode: true,
          videoRecording: recording,
          drawingMode: false,
          aiPickMode: false,
        },
        baseViewModel
      )
    ).toBe(true);
    for (const conflict of [
      { drawingMode: true },
      { aiPickMode: true },
      { viewModel: { designReviewMode: true } },
      { viewModel: { highlighterMode: true } },
      { viewModel: { quickEditMode: true } },
    ]) {
      expect(
        shouldProjectVideoRecordingControls(
          {
            videoRecordingMode: true,
            videoRecording: recording,
            drawingMode: false,
            aiPickMode: false,
            ...conflict,
          },
          { ...baseViewModel, ...conflict.viewModel }
        )
      ).toBe(false);
    }
  });
  it(
    'passes scenario props to capture actions only when after-capture action is scenario',
    verifiesScenarioCaptureForwarding
  );
  it(
    'keeps scenario capture composition while the interaction mode changes',
    verifiesScenarioCaptureAcrossInteractionModes
  );
  it(
    'forwards mode-dependent utility visibility and persisted display mode state',
    verifiesModeDependentUtilityVisibility
  );
  it(
    'suppresses cursor-only utility controls while a quick-edit transition is pending',
    verifiesPendingQuickEditSuppressesCursorUtilities
  );
  it(
    'shows the panel and export controls only in Design Review mode',
    verifiesDesignReviewControls
  );
});
