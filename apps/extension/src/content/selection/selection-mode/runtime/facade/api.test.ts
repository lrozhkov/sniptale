import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';

const {
  disableSelectionModeApiMock,
  disableSelectionModeCursorMock,
  enableSelectionModeApiMock,
  enableSelectionModeCursorMock,
  isSelectionModeActiveApiMock,
} = vi.hoisted(() => ({
  disableSelectionModeApiMock: vi.fn(),
  disableSelectionModeCursorMock: vi.fn(),
  enableSelectionModeApiMock: vi.fn(),
  enableSelectionModeCursorMock: vi.fn(),
  isSelectionModeActiveApiMock: vi.fn(),
}));

vi.mock('../../interaction/cursor', () => ({
  disableSelectionModeCursor: disableSelectionModeCursorMock,
  enableSelectionModeCursor: enableSelectionModeCursorMock,
}));

vi.mock('../../public-api', () => ({
  disableSelectionModeApi: disableSelectionModeApiMock,
  enableSelectionModeApi: enableSelectionModeApiMock,
  isSelectionModeActiveApi: isSelectionModeActiveApiMock,
}));

import { createSelectionModePublicApi } from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

function createPublicApiFixture() {
  return {
    cleanup: vi.fn(),
    createHoverElements: vi.fn(),
    createOverlayContainer: vi.fn(),
    prepare: vi.fn(async () => undefined),
    resolvedArea: { x: 10, y: 20, width: 300, height: 200 },
    setupRuntimeListeners: vi.fn(),
    session: createSelectionModeSession(),
  };
}

function configurePublicApiMocks(resolvedArea: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  enableSelectionModeApiMock.mockImplementation((args) => {
    args.session.isActive = true;
    void args.prepareUi();
    args.createHoverElements();
    args.createOverlayContainer();
    args.enableCursor();
    args.setupEventListeners();
    return Promise.resolve(resolvedArea);
  });
  isSelectionModeActiveApiMock.mockReturnValue(true);
}

function expectPublicApiWiring(
  fixture: ReturnType<typeof createPublicApiFixture>,
  api: ReturnType<typeof createSelectionModePublicApi>
) {
  api.disableSelectionMode();
  expect(api.isSelectionModeActive()).toBe(true);
  api.disableCursor();

  expect(enableSelectionModeApiMock).toHaveBeenCalledTimes(1);
  expect(disableSelectionModeApiMock).toHaveBeenCalledWith({
    cleanup: fixture.cleanup,
    session: fixture.session,
  });
  expect(enableSelectionModeCursorMock).toHaveBeenCalledWith(fixture.session);
  expect(disableSelectionModeCursorMock).toHaveBeenCalledWith(fixture.session);
  expect(fixture.prepare).toHaveBeenCalledTimes(1);
  expect(fixture.createHoverElements).toHaveBeenCalledTimes(1);
  expect(fixture.createOverlayContainer).toHaveBeenCalledTimes(1);
  expect(fixture.setupRuntimeListeners).toHaveBeenCalledTimes(1);
  expect(isSelectionModeActiveApiMock).toHaveBeenCalledWith(true);
}

async function expectRuntimeFacadeApiWiring() {
  const fixture = createPublicApiFixture();

  configurePublicApiMocks(fixture.resolvedArea);

  const api = createSelectionModePublicApi({
    cleanup: fixture.cleanup,
    session: fixture.session,
    setupRuntimeListeners: fixture.setupRuntimeListeners,
    uiRuntime: {
      createHoverElements: fixture.createHoverElements,
      createOverlayContainer: fixture.createOverlayContainer,
      prepare: fixture.prepare,
    } as never,
  });

  await expect(api.enableSelectionMode()).resolves.toEqual(fixture.resolvedArea);
  expectPublicApiWiring(fixture, api);
}

function runRuntimeFacadeApiSuite() {
  it(
    'wires the public runtime api to cursor and public-api owner seams',
    expectRuntimeFacadeApiWiring
  );
}

describe('selection-mode runtime facade api', runRuntimeFacadeApiSuite);
