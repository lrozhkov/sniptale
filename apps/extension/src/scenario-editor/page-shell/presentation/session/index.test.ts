import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageMock, storageItems } = vi.hoisted(() => {
  const storageItems = new Map<string, unknown>();
  return {
    browserStorageMock: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: storageItems.get(key) })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => storageItems.set(key, value));
        }),
      },
      subscribeToChanges: vi.fn(),
    },
    storageItems,
  };
});

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  BrowserStorageAdapter: undefined,
  BrowserStorageAreaAdapter: undefined,
  BrowserStorageChangeListener: undefined,
  BrowserStorageChanges: undefined,
  BrowserStorageGetKeys: undefined,
  BrowserStorageSetItems: undefined,
  browserStorage: browserStorageMock,
}));

import {
  createScenarioPresentationSession,
  endScenarioPresentationSession,
  loadScenarioPresentationSession,
  subscribeToScenarioPresentationSession,
  updateScenarioPresentationPosition,
  type ScenarioPresentationSessionState,
} from './index';
import { resetScenarioPresentationSessionMutationQueuesForTests } from './storage';

beforeEach(() => {
  vi.clearAllMocks();
  resetScenarioPresentationSessionMutationQueuesForTests();
  storageItems.clear();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scenario presentation session storage', () => {
  registerScenarioPresentationLifecycleTests();
  registerScenarioPresentationUpdateEndOrderingTests();
  registerScenarioPresentationTerminalTests();
  registerScenarioPresentationFallbackTests();
  registerScenarioPresentationSubscriptionTests();
});

function registerScenarioPresentationLifecycleTests() {
  it('creates, updates, loads, and ends an ephemeral session', async () => {
    const created = await createScenarioPresentationSession(
      'project-1',
      { clickIndex: 0, slideId: 'slide-1' },
      100
    );

    expect(created).toMatchObject({
      clickIndex: 0,
      projectId: 'project-1',
      projectUpdatedAt: 100,
      revision: 1,
      sessionId: '00000000-0000-4000-8000-000000000001',
      slideId: 'slide-1',
      status: 'active',
    });
    await expect(
      loadScenarioPresentationSession('00000000-0000-4000-8000-000000000001')
    ).resolves.toEqual(created);

    const updated = await updateScenarioPresentationPosition(
      '00000000-0000-4000-8000-000000000001',
      { clickIndex: 2, slideId: 'slide-2' },
      150
    );

    expect(updated).toMatchObject({
      clickIndex: 2,
      projectUpdatedAt: 150,
      revision: 2,
      slideId: 'slide-2',
      status: 'active',
    });

    await endScenarioPresentationSession('00000000-0000-4000-8000-000000000001');
    await expect(
      loadScenarioPresentationSession('00000000-0000-4000-8000-000000000001')
    ).resolves.toMatchObject({ revision: 3, status: 'ended' });
  });
}

function registerScenarioPresentationUpdateEndOrderingTests() {
  it('serializes position updates with terminal session end writes', async () => {
    const created = await createScenarioPresentationSession(
      'project-1',
      { clickIndex: 0, slideId: 'slide-1' },
      100
    );
    const firstWrite = createDeferred<void>();
    browserStorageMock.session.set.mockImplementationOnce(async (items) => {
      await firstWrite.promise;
      Object.entries(items).forEach(([key, value]) => storageItems.set(key, value));
    });

    const update = updateScenarioPresentationPosition(
      created.sessionId,
      { clickIndex: 2, slideId: 'slide-2' },
      150
    );
    await flushMicrotasks();
    const end = endScenarioPresentationSession(created.sessionId);
    await flushMicrotasks();

    expect(browserStorageMock.session.set).toHaveBeenCalledTimes(2);

    firstWrite.resolve(undefined);
    await Promise.all([update, end]);

    await expect(loadScenarioPresentationSession(created.sessionId)).resolves.toMatchObject({
      clickIndex: 2,
      revision: 3,
      slideId: 'slide-2',
      status: 'ended',
    });
  });
}

function registerScenarioPresentationTerminalTests() {
  it('does not reactivate an ended session from a later position update', async () => {
    const created = await createScenarioPresentationSession(
      'project-1',
      { clickIndex: 0, slideId: 'slide-1' },
      100
    );

    await endScenarioPresentationSession(created.sessionId);

    await expect(
      updateScenarioPresentationPosition(
        created.sessionId,
        { clickIndex: 4, slideId: 'slide-4' },
        200
      )
    ).resolves.toMatchObject({ revision: 2, status: 'ended' });
    await expect(loadScenarioPresentationSession(created.sessionId)).resolves.toMatchObject({
      clickIndex: 0,
      revision: 2,
      slideId: 'slide-1',
      status: 'ended',
    });
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function registerScenarioPresentationFallbackTests() {
  it('returns null for a missing or malformed session', async () => {
    await expect(loadScenarioPresentationSession('missing')).resolves.toBeNull();

    storageItems.set('scenarioPresentationSession:bad', { sessionId: 'bad', revision: 'old' });

    await expect(loadScenarioPresentationSession('bad')).resolves.toBeNull();
  });

  it('uses crypto random values when randomUUID is unavailable', async () => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
      ]);
      return array;
    });

    const created = await createScenarioPresentationSession(
      'project-1',
      { clickIndex: 0, slideId: 'slide-1' },
      100
    );

    expect(created.sessionId).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });
}

function registerScenarioPresentationSubscriptionTests() {
  it('ignores stale revisions in the subscriber reducer', () => {
    const listener = vi.fn();
    const storageListeners: Array<
      (changes: Record<string, { newValue?: unknown }>, areaName: chrome.storage.AreaName) => void
    > = [];
    browserStorageMock.subscribeToChanges.mockImplementation((nextListener) => {
      storageListeners.push(nextListener);
      return vi.fn();
    });

    subscribeToScenarioPresentationSession('session-1', listener);

    const fresh = createState({ clickIndex: 1, revision: 2 });
    const stale = createState({ clickIndex: 0, revision: 1 });
    const emitStorageChange = storageListeners[0];
    expect(emitStorageChange).toBeDefined();
    emitStorageChange?.(
      { 'scenarioPresentationSession:session-1': { newValue: fresh } },
      'session'
    );
    emitStorageChange?.(
      { 'scenarioPresentationSession:session-1': { newValue: stale } },
      'session'
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(fresh);
  });
}

function createState(
  patch: Partial<ScenarioPresentationSessionState> = {}
): ScenarioPresentationSessionState {
  return {
    clickIndex: 0,
    projectId: 'project-1',
    projectUpdatedAt: 100,
    revision: 1,
    sessionId: 'session-1',
    slideId: 'slide-1',
    status: 'active',
    ...patch,
  };
}
