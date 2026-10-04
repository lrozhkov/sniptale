// @vitest-environment jsdom

import { act, type MouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentAppLayoutScenarioProps } from './types';

const captureMocks = vi.hoisted(() => ({
  source: vi.fn<(event: Event) => { kind: 'trusted-content-event' } | null>(),
  error: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: captureMocks.toast }));
vi.mock('../../application/privileged-action-intent', () => ({
  createTrustedContentActionIntentSource: captureMocks.source,
}));
vi.mock('../screenshot/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../screenshot/feedback')>()),
  showScreenshotError: captureMocks.error,
}));

const { scenarioRecorderSidebarMock } = vi.hoisted(() => ({
  scenarioRecorderSidebarMock: vi.fn((props: Record<string, unknown>) => (
    <>
      <button
        data-ui="content.scenario-sidebar"
        onClick={() => {
          void (props['onFinish'] as () => void)();
        }}
        type="button"
      >
        sidebar
      </button>
      <button
        type="button"
        data-ui="capture-probe"
        disabled={props['captureBusy'] === true}
        onClick={(event) =>
          void (
            props['onCaptureVisible'] as (event: MouseEvent<HTMLButtonElement>) => Promise<void>
          )(event)
        }
      />
    </>
  )),
}));

vi.mock('../scenario-recorder/sidebar', () => ({
  ScenarioRecorderSidebar: (props: Record<string, unknown>) => scenarioRecorderSidebarMock(props),
}));

import { ContentScenarioRecorderSidebar } from './sidebar';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const SCENARIO_SIDEBAR_TEST_NAME =
  'renders only when scenario recording is enabled and visible, and finishes through the scenario recorder flow';

function createScenarioController() {
  return {
    applyCaptureAction: vi.fn(async () => undefined),
    captureAction: 'scenario' as const,
    createProject: vi.fn(async () => undefined),
    deleteRecentStep: vi.fn(async () => undefined),
    finishRecording: vi.fn(async () => undefined),
    handleScreenshotModeDisabled: vi.fn(async () => undefined),
    moveRecentStep: vi.fn(async () => undefined),
    openEditor: vi.fn(async () => undefined),
    pendingProjectSelection: false,
    projects: [],
    recentStepHighlightToken: 0,
    recentSteps: [] as ContentAppLayoutScenarioProps['state']['recentSteps'],
    rememberProjectSelection: false,
    restoreRecentStep: vi.fn(async () => undefined),
    scenarioCaptureMode: 'manual' as const,
    scenarioEnabled: true,
    scenarioProjectId: 'project-1',
    scenarioProjectName: 'Project',
    selectProject: vi.fn(async () => undefined),
    setCaptureMode: vi.fn(async () => undefined),
    setEnabled: vi.fn(async () => undefined),
    setRememberProjectSelection: vi.fn(),
    setSidebarVisible: vi.fn(),
    sidebarVisible: true,
    trashedSteps: [],
  };
}

function createScenarioProps() {
  const controller = createScenarioController();

  return {
    actions: {
      applyCaptureAction: controller.applyCaptureAction,
      createProject: controller.createProject,
      deleteRecentStep: controller.deleteRecentStep,
      finishRecording: controller.finishRecording,
      handleScreenshotModeDisabled: controller.handleScreenshotModeDisabled,
      moveRecentStep: controller.moveRecentStep,
      openEditor: controller.openEditor,
      selectProject: controller.selectProject,
      setCaptureMode: controller.setCaptureMode,
      setRememberProjectSelection: controller.setRememberProjectSelection,
      setSidebarVisible: controller.setSidebarVisible,
    },
    state: {
      captureAction: controller.captureAction,
      pendingProjectSelection: controller.pendingProjectSelection,
      projects: controller.projects,
      recentStepHighlightToken: controller.recentStepHighlightToken,
      recentSteps: controller.recentSteps,
      rememberProjectSelection: controller.rememberProjectSelection,
      scenarioCaptureMode: controller.scenarioCaptureMode,
      scenarioEnabled: controller.scenarioEnabled,
      scenarioProjectId: controller.scenarioProjectId,
      scenarioProjectName: controller.scenarioProjectName,
      sidebarVisible: controller.sidebarVisible,
    },
  } satisfies ContentAppLayoutScenarioProps;
}

function createProps() {
  return {
    isCompletelyHidden: false,
    captureSuspended: false,
    isToolbarVisible: true,
    byClickDisabled: false,
    handleTakeScreenshot: vi.fn<() => Promise<void>>(async () => undefined),
    keepPinnedForAutoBlur: false,
    modeController: {
      handleToggleScreenshotMode: vi.fn(),
    },
    scenario: createScenarioProps(),
    setPinToTab: vi.fn(),
  };
}

async function renderSidebar(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContentScenarioRecorderSidebar {...props} />);
  });
}

async function clickRenderedSidebarButton() {
  const sidebarButton = container?.querySelector(
    '[data-ui="content.scenario-sidebar"]'
  ) as HTMLButtonElement;
  expect(sidebarButton).not.toBeNull();
  sidebarButton.click();
  await Promise.resolve();
}

async function verifySidebarHideStates(props: ReturnType<typeof createProps>) {
  props.scenario.state.sidebarVisible = false;
  await renderSidebar(props);
  expect(container?.querySelector('[data-ui="content.scenario.sidebar.restore"]')).not.toBeNull();

  props.scenario.state.sidebarVisible = true;
  props.isToolbarVisible = false;
  await renderSidebar(props);
  expect(container?.textContent).toBe('sidebar');

  props.isToolbarVisible = true;
  props.isCompletelyHidden = true;
  await renderSidebar(props);
  expect(container?.textContent).toBe('');
}

async function verifyDeferredHighlightRestore(props: ReturnType<typeof createProps>) {
  props.scenario.state.recentSteps = [
    {
      id: 'step-2',
      position: 1,
      numberLabel: '2',
      previewDataUrl: 'data:image/png;base64,2',
      title: 'Latest step',
    },
  ] as ContentAppLayoutScenarioProps['state']['recentSteps'];
  props.scenario.state.recentStepHighlightToken = 1;
  await renderSidebar(props);

  props.isCompletelyHidden = false;
  await renderSidebar(props);
  expect(scenarioRecorderSidebarMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      forcedHighlightStepId: 'step-2',
      forcedHighlightVersion: 1,
    })
  );
}

function createRecentStep(id: string, title: string) {
  return {
    id,
    position: 1,
    numberLabel: '2',
    previewDataUrl: `data:image/png;base64,${id}`,
    title,
  };
}

function registerContentScenarioRecorderSidebarTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    captureMocks.source.mockReturnValue({ kind: 'trusted-content-event' });
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
}

registerContentScenarioRecorderSidebarTestScope();

describe('ContentScenarioRecorderSidebar finish flow', () => {
  it(SCENARIO_SIDEBAR_TEST_NAME, async () => {
    const props = createProps();
    await renderSidebar(props);

    await clickRenderedSidebarButton();

    expect(props.modeController.handleToggleScreenshotMode).toHaveBeenCalledWith(false);
    expect(props.setPinToTab).toHaveBeenCalledWith(false);
    expect(props.scenario.actions.finishRecording).toHaveBeenCalledTimes(1);
    expect(props.scenario.actions.openEditor).not.toHaveBeenCalled();

    await verifySidebarHideStates(props);
    await verifyDeferredHighlightRestore(props);
  });

  it('blocks repeated finish while pending and keeps the panel usable after failure', async () => {
    const props = createProps();
    let reject!: (reason: Error) => void;
    props.scenario.actions.finishRecording.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    await renderSidebar(props);
    await act(async () => {
      await clickRenderedSidebarButton();
      await clickRenderedSidebarButton();
    });
    expect(props.scenario.actions.finishRecording).toHaveBeenCalledOnce();
    expect(scenarioRecorderSidebarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ finishBusy: true, captureBusy: true })
    );
    expect(props.modeController.handleToggleScreenshotMode).not.toHaveBeenCalled();
    await act(async () => {
      reject(new Error('Open failed'));
    });
    expect(captureMocks.toast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(props.setPinToTab).not.toHaveBeenCalled();
    await act(async () => {
      await clickRenderedSidebarButton();
    });
    expect(props.scenario.actions.finishRecording).toHaveBeenCalledTimes(2);
    expect(props.modeController.handleToggleScreenshotMode).toHaveBeenCalledWith(false);
  });

  it('keeps the panel pinned when finishing a scenario with automatic blur active', async () => {
    const props = createProps();
    props.keepPinnedForAutoBlur = true;
    await renderSidebar(props);

    await clickRenderedSidebarButton();

    expect(props.modeController.handleToggleScreenshotMode).toHaveBeenCalledWith(false);
    expect(props.setPinToTab).not.toHaveBeenCalled();
    expect(props.scenario.actions.openEditor).not.toHaveBeenCalled();
  });
});

describe('ContentScenarioRecorderSidebar latest-step highlight', () => {
  it('replays the latest-step highlight after screenshot hiding interrupts a fresh addition', async () => {
    const props = createProps();
    await renderSidebar(props);

    props.scenario.state.recentSteps = [
      createRecentStep('step-2', 'Latest step'),
    ] as ContentAppLayoutScenarioProps['state']['recentSteps'];
    props.scenario.state.recentStepHighlightToken = 1;
    await renderSidebar(props);

    props.isCompletelyHidden = true;
    await renderSidebar(props);
    props.isCompletelyHidden = false;
    await renderSidebar(props);

    expect(scenarioRecorderSidebarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forcedHighlightStepId: 'step-2',
        forcedHighlightVersion: 1,
      })
    );
  });
});

describe('ContentScenarioRecorderSidebar first visible highlight', () => {
  it('forces the latest-step highlight when the first visible render already contains the new step', async () => {
    const props = createProps();
    props.isCompletelyHidden = true;
    await renderSidebar(props);

    props.isCompletelyHidden = false;
    props.scenario.state.recentSteps = [
      createRecentStep('step-3', 'Restored latest step'),
    ] as ContentAppLayoutScenarioProps['state']['recentSteps'];
    props.scenario.state.recentStepHighlightToken = 1;
    await renderSidebar(props);

    expect(scenarioRecorderSidebarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forcedHighlightStepId: 'step-3',
        forcedHighlightVersion: 1,
      })
    );
  });
});

it('passes a pending first capture to the panel project chooser', async () => {
  const props = createProps();
  props.scenario.state.pendingProjectSelection = true;
  await renderSidebar(props);

  expect(scenarioRecorderSidebarMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ pendingProjectSelection: true })
  );
});

it('keeps the panel suspended between countdown expiry and capture completion', async () => {
  const props = createProps();
  await renderSidebar(props);
  props.captureSuspended = true;
  props.isToolbarVisible = false;
  await renderSidebar(props);
  expect(container?.textContent).toBe('');
  props.captureSuspended = false;
  await renderSidebar(props);
  expect(container?.textContent).toBe('');
  props.isToolbarVisible = true;
  await renderSidebar(props);
  expect(container?.textContent).toBe('sidebar');
});

it('keeps pending capture ownership through hidden panel remounts and allows failure retry', async () => {
  const props = createProps();
  let finish = () => {};
  props.handleTakeScreenshot.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  await renderSidebar(props);
  const click = () =>
    container?.querySelector<HTMLButtonElement>('[data-ui="capture-probe"]')?.click();
  act(() => {
    click();
    click();
  });
  expect(props.handleTakeScreenshot).toHaveBeenCalledExactlyOnceWith('visible', {
    kind: 'trusted-content-event',
  });
  expect(captureMocks.source.mock.calls[0]?.[0]).toBeInstanceOf(Event);
  props.isCompletelyHidden = true;
  await renderSidebar(props);
  props.isCompletelyHidden = false;
  await renderSidebar(props);
  expect(container?.querySelector<HTMLButtonElement>('[data-ui="capture-probe"]')?.disabled).toBe(
    true
  );
  await act(async () => finish());
  props.handleTakeScreenshot.mockRejectedValueOnce(new Error('capture failed'));
  await act(async () => click());
  expect(captureMocks.error).toHaveBeenCalledTimes(1);
  expect(container?.querySelector<HTMLButtonElement>('[data-ui="capture-probe"]')?.disabled).toBe(
    false
  );
  captureMocks.source.mockReturnValue(null);
  await act(async () => click());
  expect(props.handleTakeScreenshot).toHaveBeenCalledTimes(2);
});
