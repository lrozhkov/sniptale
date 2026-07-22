import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';

const { createSelectionModeFacadeUiMock, createSelectionModeSizePanelSetupMock } = vi.hoisted(
  () => ({
    createSelectionModeFacadeUiMock: vi.fn(),
    createSelectionModeSizePanelSetupMock: vi.fn(),
  })
);

vi.mock('./ui', () => ({
  createSelectionModeFacadeUi: createSelectionModeFacadeUiMock,
}));

vi.mock('../../ui/size-panel/runtime', () => ({
  createSelectionModeSizePanelSetup: createSelectionModeSizePanelSetupMock,
}));

import { createSelectionModeRuntimeSetup } from './setup';

beforeEach(() => {
  vi.clearAllMocks();
});

function createRuntimeFacadeSetupFixture() {
  const state = createSelectionModeSession();

  return {
    args: {
      cleanup: vi.fn(),
      cancelSelection: vi.fn(),
      confirmSelection: vi.fn(),
      constrainSelection: vi.fn(),
      getMaxSelectionHeight: () => 720,
      getMaxSelectionWidth: () => 1280,
      resetToIdleState: vi.fn(),
      session: state,
      setupRuntimeListeners: vi.fn(),
      updateFinalFrame: vi.fn(),
    },
    setupSizePanelListeners: vi.fn(),
    uiRuntime: { createHoverElements: vi.fn(), createOverlayContainer: vi.fn(), prepare: vi.fn() },
  };
}

function expectRuntimeSetupWiring(
  fixture: ReturnType<typeof createRuntimeFacadeSetupFixture>,
  runtimeSetup: ReturnType<typeof createSelectionModeRuntimeSetup>
) {
  expect(createSelectionModeSizePanelSetupMock).toHaveBeenCalledWith({
    constrainSelection: fixture.args.constrainSelection,
    getMaxSelectionHeight: expect.any(Function),
    getMaxSelectionWidth: expect.any(Function),
    session: fixture.args.session,
    updateFinalFrame: fixture.args.updateFinalFrame,
  });
  expect(createSelectionModeFacadeUiMock).toHaveBeenCalledWith({
    cancelSelection: fixture.args.cancelSelection,
    confirmSelection: fixture.args.confirmSelection,
    getDom: expect.any(Function),
    getMaxSelectionHeight: expect.any(Function),
    getMaxSelectionWidth: expect.any(Function),
    onSetupSizePanelListeners: fixture.setupSizePanelListeners,
    resetToIdleState: fixture.args.resetToIdleState,
  });
  expect(runtimeSetup).toEqual({
    setupSizePanelListeners: fixture.setupSizePanelListeners,
    uiRuntime: fixture.uiRuntime,
  });
}

function expectRuntimeFacadeSetupWiring() {
  const fixture = createRuntimeFacadeSetupFixture();

  createSelectionModeSizePanelSetupMock.mockReturnValue(fixture.setupSizePanelListeners);
  createSelectionModeFacadeUiMock.mockReturnValue(fixture.uiRuntime);

  const runtimeSetup = createSelectionModeRuntimeSetup(fixture.args);

  expectRuntimeSetupWiring(fixture, runtimeSetup);
}

function runRuntimeFacadeSetupSuite() {
  it(
    'creates the size-panel and ui runtime setup from the shared facade args',
    expectRuntimeFacadeSetupWiring
  );
}

describe('selection-mode runtime facade setup', runRuntimeFacadeSetupSuite);
