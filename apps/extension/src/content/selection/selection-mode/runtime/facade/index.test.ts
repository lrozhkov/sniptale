import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Z_INDEX_BASE } from '../../constants';
import { createSelectionModeSession } from '../../session';

const { createSelectionModePublicApiMock, createSelectionModeRuntimeSetupMock } = vi.hoisted(
  () => ({
    createSelectionModePublicApiMock: vi.fn(),
    createSelectionModeRuntimeSetupMock: vi.fn(),
  })
);

vi.mock('./api', () => ({
  createSelectionModePublicApi: createSelectionModePublicApiMock,
}));

vi.mock('./setup', () => ({
  createSelectionModeRuntimeSetup: createSelectionModeRuntimeSetupMock,
}));

import { createSelectionModeRuntimeFacade } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

function createRuntimeFacadeFixture() {
  const state = createSelectionModeSession();
  const publicApi = {
    disableCursor: vi.fn(),
    disableSelectionMode: vi.fn(),
    enableSelectionMode: vi.fn(),
    isSelectionModeActive: vi.fn(),
  };

  return {
    args: {
      cancelSelection: vi.fn(),
      cleanup: vi.fn(),
      confirmSelection: vi.fn(),
      constrainSelection: vi.fn(),
      getMaxSelectionHeight: () => 720,
      getMaxSelectionWidth: () => 1280,
      resetToIdleState: vi.fn(),
      session: state,
      setupRuntimeListeners: vi.fn(),
      updateFinalFrame: vi.fn(),
    },
    publicApi,
    setupSizePanelListeners: vi.fn(),
    uiRuntime: { createHoverElements: vi.fn(), createOverlayContainer: vi.fn(), prepare: vi.fn() },
  };
}

function expectRuntimeFacadeWiring(
  fixture: ReturnType<typeof createRuntimeFacadeFixture>,
  facade: ReturnType<typeof createSelectionModeRuntimeFacade>
) {
  expect(facade).toEqual({
    ...fixture.publicApi,
    setupSizePanelListeners: fixture.setupSizePanelListeners,
    uiRuntime: fixture.uiRuntime,
    zIndexBase: Z_INDEX_BASE,
  });
  expect(createSelectionModeRuntimeSetupMock).toHaveBeenCalledWith(fixture.args);
  expect(createSelectionModePublicApiMock).toHaveBeenCalledWith({
    cleanup: fixture.args.cleanup,
    session: fixture.args.session,
    setupRuntimeListeners: fixture.args.setupRuntimeListeners,
    uiRuntime: fixture.uiRuntime,
  });
}

function expectRuntimeFacadeComposition() {
  const fixture = createRuntimeFacadeFixture();

  createSelectionModeRuntimeSetupMock.mockReturnValue({
    setupSizePanelListeners: fixture.setupSizePanelListeners,
    uiRuntime: fixture.uiRuntime,
  });
  createSelectionModePublicApiMock.mockReturnValue(fixture.publicApi);

  const facade = createSelectionModeRuntimeFacade(fixture.args);

  expectRuntimeFacadeWiring(fixture, facade);
}

function runRuntimeFacadeSuite() {
  it(
    'merges setup and public api seams into the runtime facade surface',
    expectRuntimeFacadeComposition
  );
}

describe('selection-mode runtime facade', runRuntimeFacadeSuite);
