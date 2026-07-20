import { beforeEach, expect, it, vi } from 'vitest';

const { hydrateScenarioSessionStateMock, persistScenarioSessionStateMock } = vi.hoisted(() => ({
  hydrateScenarioSessionStateMock: vi.fn(),
  persistScenarioSessionStateMock: vi.fn(),
}));

vi.mock('../../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state')>()),
  hydrateScenarioSessionState: hydrateScenarioSessionStateMock,
  persistScenarioSessionState: persistScenarioSessionStateMock,
}));

import { createScenarioSessionServiceLifecycle } from './lifecycle';
import { createDefaultScenarioSessionState } from '../../helpers';
import { createScenarioSessionServiceState } from '../state';

beforeEach(() => {
  vi.clearAllMocks();
  hydrateScenarioSessionStateMock.mockResolvedValue(undefined);
  persistScenarioSessionStateMock.mockResolvedValue(undefined);
});

it('retries hydration after a rejected first attempt', async () => {
  const state = createScenarioSessionServiceState();
  const lifecycle = createScenarioSessionServiceLifecycle(state);
  hydrateScenarioSessionStateMock
    .mockRejectedValueOnce(new Error('storage unavailable'))
    .mockResolvedValueOnce(undefined);

  await expect(lifecycle.ensureHydrated()).rejects.toThrow('storage unavailable');
  await expect(lifecycle.ensureHydrated()).resolves.toBeUndefined();

  expect(hydrateScenarioSessionStateMock).toHaveBeenCalledTimes(2);
  expect(state.hydrationPromise).not.toBeNull();
});

it('persists the durable state buckets through the lifecycle owner', async () => {
  const state = createScenarioSessionServiceState();
  state.sessions.set(7, { ...createDefaultScenarioSessionState(), enabled: true });

  const lifecycle = createScenarioSessionServiceLifecycle(state);
  await lifecycle.persistSessions();

  expect(persistScenarioSessionStateMock).toHaveBeenCalledWith({
    pendingCaptures: state.pendingCaptures,
    sessions: state.sessions,
    surfaces: state.surfaces,
  });
});
