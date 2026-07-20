import { expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  createScenarioSessionPendingCaptureBridgeMock: vi.fn(),
  createScenarioSessionPendingCaptureContextMock: vi.fn(),
  createScenarioSessionServiceClearTabMock: vi.fn(),
  createScenarioSessionServiceStateMock: vi.fn(),
  getMutableScenarioSessionMock: vi.fn(),
  getMutableScenarioSurfaceMock: vi.fn(),
  hydrateScenarioSessionStateMock: vi.fn(),
  persistScenarioSessionStateMock: vi.fn(),
}));

vi.mock('../../state', () => ({
  getMutableScenarioSession: coreMocks.getMutableScenarioSessionMock,
  getMutableScenarioSurface: coreMocks.getMutableScenarioSurfaceMock,
  hydrateScenarioSessionState: coreMocks.hydrateScenarioSessionStateMock,
  persistScenarioSessionState: coreMocks.persistScenarioSessionStateMock,
}));

vi.mock('../../pending-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pending-capture')>()),
  createScenarioSessionPendingCaptureBridge:
    coreMocks.createScenarioSessionPendingCaptureBridgeMock,
}));

vi.mock('../state', () => ({
  createScenarioSessionPendingCaptureContext:
    coreMocks.createScenarioSessionPendingCaptureContextMock,
  createScenarioSessionServiceClearTab: coreMocks.createScenarioSessionServiceClearTabMock,
  createScenarioSessionServiceState: coreMocks.createScenarioSessionServiceStateMock,
}));

import { createScenarioSessionServiceCore } from './build';

function createState() {
  return {
    hydrationPromise: null,
    pendingCaptures: new Map([[7, { id: 'capture-1' }]]),
    revisions: new Map([[7, 11]]),
    sessions: new Map([[7, { enabled: true }]]),
    surfaces: new Map([[7, { screenshotMode: true }]]),
  };
}

it('wires runtime core state through owner-local helpers', async () => {
  const state = createState();
  const pendingCaptureBridge = { has: vi.fn(() => true) };
  const clearTab = vi.fn();

  coreMocks.createScenarioSessionServiceStateMock.mockReturnValue(state);
  coreMocks.getMutableScenarioSessionMock.mockReturnValue(state.sessions.get(7));
  coreMocks.getMutableScenarioSurfaceMock.mockReturnValue(state.surfaces.get(7));
  coreMocks.createScenarioSessionPendingCaptureContextMock.mockReturnValue({
    ensureHydrated: vi.fn(async () => {}),
    getMutableSession: vi.fn(),
    pendingCaptures: state.pendingCaptures,
    persistSessions: vi.fn(async () => {}),
  });
  coreMocks.createScenarioSessionPendingCaptureBridgeMock.mockReturnValue(pendingCaptureBridge);
  coreMocks.createScenarioSessionServiceClearTabMock.mockReturnValue(clearTab);
  coreMocks.hydrateScenarioSessionStateMock.mockResolvedValue(undefined);
  coreMocks.persistScenarioSessionStateMock.mockResolvedValue(undefined);

  const core = createScenarioSessionServiceCore();

  expect(core).toMatchObject({
    hydrationPromise: null,
    pendingCaptures: state.pendingCaptures,
    revisions: state.revisions,
    sessions: state.sessions,
    surfaces: state.surfaces,
    pendingCaptureBridge,
    clearTab,
  });
  expect(coreMocks.createScenarioSessionServiceStateMock).toHaveBeenCalledOnce();
  expect(coreMocks.createScenarioSessionPendingCaptureContextMock).toHaveBeenCalledWith(
    state.pendingCaptures,
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    expect.any(Function)
  );
  expect(coreMocks.createScenarioSessionPendingCaptureBridgeMock).toHaveBeenCalledWith(
    expect.objectContaining({ pendingCaptures: state.pendingCaptures })
  );
  expect(coreMocks.createScenarioSessionServiceClearTabMock).toHaveBeenCalledWith({
    ensureHydrated: expect.any(Function),
    persistSessions: expect.any(Function),
    runPersistedWrite: expect.any(Function),
    state,
  });
});

it('hydrates once and persists through the runtime core helpers', async () => {
  const state = createState();
  const pendingCaptureBridge = { has: vi.fn(() => false) };
  const clearTab = vi.fn();

  coreMocks.createScenarioSessionServiceStateMock.mockReturnValue(state);
  coreMocks.getMutableScenarioSessionMock.mockReturnValue(state.sessions.get(7));
  coreMocks.getMutableScenarioSurfaceMock.mockReturnValue(state.surfaces.get(7));
  coreMocks.createScenarioSessionPendingCaptureContextMock.mockReturnValue({
    ensureHydrated: vi.fn(async () => {}),
    getMutableSession: vi.fn(),
    pendingCaptures: state.pendingCaptures,
    persistSessions: vi.fn(async () => {}),
  });
  coreMocks.createScenarioSessionPendingCaptureBridgeMock.mockReturnValue(pendingCaptureBridge);
  coreMocks.createScenarioSessionServiceClearTabMock.mockReturnValue(clearTab);
  coreMocks.hydrateScenarioSessionStateMock.mockResolvedValue(undefined);
  coreMocks.persistScenarioSessionStateMock.mockResolvedValue(undefined);

  const core = createScenarioSessionServiceCore();

  await core.ensureHydrated();
  await core.persistSessions();

  expect(coreMocks.hydrateScenarioSessionStateMock).toHaveBeenCalledTimes(1);
  expect(coreMocks.persistScenarioSessionStateMock).toHaveBeenCalledWith({
    pendingCaptures: state.pendingCaptures,
    sessions: state.sessions,
    surfaces: state.surfaces,
  });
});
