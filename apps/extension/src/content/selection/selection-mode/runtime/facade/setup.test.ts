import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeState } from '../../session/state';

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
  const state = createSelectionModeState();

  return {
    args: {
      cleanup: vi.fn(),
      cancelSelection: vi.fn(),
      confirmSelection: vi.fn(),
      constrainSelection: vi.fn(),
      getDom: () => state.dom,
      getAspectRatio: () => 16 / 9,
      getCurrentSelection: () => state.currentSelection,
      getIsActive: () => false,
      getMaintainAspectRatio: () => true,
      getMaxSelectionHeight: () => 720,
      getMaxSelectionWidth: () => 1280,
      getRejectCallback: () => null,
      resetToIdleState: vi.fn(),
      setAspectRatio: vi.fn(),
      setCurrentSelection: vi.fn(),
      setCurrentState: vi.fn(),
      setIsActive: vi.fn(),
      setMaintainAspectRatio: vi.fn(),
      setRejectCallback: vi.fn(),
      setResolveCallback: vi.fn(),
      setupRuntimeListeners: vi.fn(),
      state,
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
    getAspectRatio: expect.any(Function),
    getCurrentSelection: expect.any(Function),
    getMaintainAspectRatio: expect.any(Function),
    getMaxSelectionHeight: expect.any(Function),
    getMaxSelectionWidth: expect.any(Function),
    setAspectRatio: expect.any(Function),
    setCurrentSelection: expect.any(Function),
    setMaintainAspectRatio: expect.any(Function),
    state: fixture.args.state,
    updateFinalFrame: fixture.args.updateFinalFrame,
  });
  expect(createSelectionModeFacadeUiMock).toHaveBeenCalledWith({
    cancelSelection: fixture.args.cancelSelection,
    confirmSelection: fixture.args.confirmSelection,
    getDom: fixture.args.getDom,
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
