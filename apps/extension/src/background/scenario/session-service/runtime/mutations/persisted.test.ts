import { expect, it, vi } from 'vitest';

import { runPersistedMutation } from './persisted';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import { createScenarioSessionPersistedWriteQueue } from '../core/persisted-write';
import type { ScenarioSessionServiceCore } from '../types/index';

function createSession(): ScenarioSessionState {
  return {
    captureMode: 'manual',
    enabled: false,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    sidebarVisible: true,
  };
}

function createSurface(): ScenarioRecorderSurfaceState {
  return {
    captureAction: 'download_default',
    screenshotMode: false,
    toolbarVisible: false,
  };
}

function createPendingCaptureBridge(): ScenarioSessionServiceCore['pendingCaptureBridge'] {
  return {
    buffer: vi.fn(async () => createSession()),
    clear: vi.fn(async () => createSession()),
    clearIfCurrent: vi.fn(async () => createSession()),
    consume: vi.fn(async () => null),
    get: vi.fn(() => null),
    has: vi.fn(() => true),
    resolve: vi.fn(async () => null),
  };
}

function createCore(): ScenarioSessionServiceCore {
  return {
    clearTab: vi.fn(),
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    getMutableSession: vi.fn(() => createSession()),
    getMutableSurface: vi.fn(() => createSurface()),
    hydrationPromise: null,
    pendingCaptures: new Map(),
    pendingCaptureBridge: createPendingCaptureBridge(),
    persistSessions: vi.fn().mockResolvedValue(undefined),
    revisions: new Map(),
    runPersistedWrite: createScenarioSessionPersistedWriteQueue(),
    sessions: new Map(),
    surfaces: new Map(),
  };
}

function createDeferred() {
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

it('hydrates, persists, and returns a cloned mutation result', async () => {
  const core = createCore();
  const session = createSession();
  const result = await runPersistedMutation({
    cloneResult: (value) => ({ ...value }),
    core,
    mutate: () => {
      session.enabled = true;
      return session;
    },
  });

  expect(core.ensureHydrated).toHaveBeenCalledTimes(1);
  expect(core.persistSessions).toHaveBeenCalledTimes(1);
  expect(result).toEqual({
    captureMode: 'manual',
    enabled: true,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    sidebarVisible: true,
  });
  expect(result).not.toBe(session);
});

it('restores mutable scenario session state when persistence fails', async () => {
  const core = createCore();
  const previousSession = { ...createSession(), enabled: false };
  const previousSurface = { ...createSurface(), toolbarVisible: false };
  core.sessions.set(1, previousSession);
  core.surfaces.set(1, previousSurface);
  core.revisions.set(1, 7);
  vi.mocked(core.getMutableSession).mockReturnValue(previousSession);
  vi.mocked(core.getMutableSurface).mockReturnValue(previousSurface);
  vi.mocked(core.persistSessions).mockRejectedValue(new Error('persist failed'));

  await expect(
    runPersistedMutation({
      cloneResult: (value) => ({ ...value }),
      core,
      mutate: () => {
        previousSession.enabled = true;
        previousSurface.toolbarVisible = true;
        core.revisions.set(1, 8);
        return previousSession;
      },
    })
  ).rejects.toThrow('persist failed');

  expect(core.sessions.get(1)).toEqual({ ...createSession(), enabled: false });
  expect(core.surfaces.get(1)).toEqual({ ...createSurface(), toolbarVisible: false });
  expect(core.revisions.get(1)).toBe(8);
});

it('serializes persisted mutations so failed rollback cannot overwrite a later success', async () => {
  const core = createCore();
  const session = { ...createSession(), enabled: false };
  core.sessions.set(1, session);
  vi.mocked(core.getMutableSession).mockImplementation((tabId) => core.sessions.get(tabId)!);
  const firstPersist = createDeferred();
  vi.mocked(core.persistSessions)
    .mockReturnValueOnce(firstPersist.promise)
    .mockResolvedValueOnce(undefined);

  const firstMutation = runPersistedMutation({
    cloneResult: (value) => ({ ...value }),
    core,
    mutate: () => {
      const mutableSession = core.getMutableSession(1);
      mutableSession.enabled = true;
      return mutableSession;
    },
  });
  const secondMutation = runPersistedMutation({
    cloneResult: (value) => ({ ...value }),
    core,
    mutate: () => {
      const mutableSession = core.getMutableSession(1);
      mutableSession.sidebarVisible = false;
      return mutableSession;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(core.persistSessions).toHaveBeenCalledTimes(1);
  expect(core.sessions.get(1)?.sidebarVisible).toBe(true);

  firstPersist.reject(new Error('first persist failed'));
  await expect(firstMutation).rejects.toThrow('first persist failed');
  await expect(secondMutation).resolves.toEqual(
    expect.objectContaining({ enabled: false, sidebarVisible: false })
  );

  expect(core.persistSessions).toHaveBeenCalledTimes(2);
  expect(core.sessions.get(1)).toEqual(
    expect.objectContaining({ enabled: false, sidebarVisible: false })
  );
});

it('does not roll back revision freshness updates when session persistence fails', async () => {
  const core = createCore();
  const session = { ...createSession(), enabled: false };
  core.sessions.set(1, session);
  core.revisions.set(1, 7);
  vi.mocked(core.getMutableSession).mockImplementation((tabId) => core.sessions.get(tabId)!);
  const firstPersist = createDeferred();
  vi.mocked(core.persistSessions).mockReturnValueOnce(firstPersist.promise);

  const mutation = runPersistedMutation({
    cloneResult: (value) => ({ ...value }),
    core,
    mutate: () => {
      const mutableSession = core.getMutableSession(1);
      mutableSession.enabled = true;
      return mutableSession;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  core.revisions.set(1, 8);
  firstPersist.reject(new Error('persist failed'));

  await expect(mutation).rejects.toThrow('persist failed');

  expect(core.sessions.get(1)).toEqual(expect.objectContaining({ enabled: false }));
  expect(core.revisions.get(1)).toBe(8);
});
