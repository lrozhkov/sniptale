import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../../../composition/persistence/infrastructure/browser-storage', () => ({
  BrowserStorageAdapter: undefined,
  BrowserStorageAreaAdapter: undefined,
  BrowserStorageChangeListener: undefined,
  BrowserStorageChanges: undefined,
  BrowserStorageGetKeys: undefined,
  BrowserStorageSetItems: undefined,
  browserStorage: browserStorageMock,
}));

import {
  loadScenarioPresentationSessionStorageValue,
  resetScenarioPresentationSessionMutationQueuesForTests,
  runScenarioPresentationSessionMutation,
  subscribeToScenarioPresentationSessionStorage,
  writeScenarioPresentationSessionStorageState,
} from './index';
import {
  SCENARIO_PRESENTATION_SESSION_STATUS,
  type ScenarioPresentationSessionState,
} from '../types';

beforeEach(() => {
  vi.clearAllMocks();
  resetScenarioPresentationSessionMutationQueuesForTests();
  storageItems.clear();
});

describe('scenario presentation session storage owner', () => {
  registerScenarioPresentationStorageReadWriteTests();
  registerScenarioPresentationStorageSubscriptionTests();
  registerScenarioPresentationStorageMutationQueueTests();
});

function registerScenarioPresentationStorageReadWriteTests() {
  it('loads and writes session state by session-owned storage key', async () => {
    const state = createState();

    await writeScenarioPresentationSessionStorageState(state);

    expect(browserStorageMock.session.set).toHaveBeenCalledWith({
      'scenarioPresentationSession:session-1': state,
    });
    await expect(loadScenarioPresentationSessionStorageValue('session-1')).resolves.toEqual(state);
  });
}

function registerScenarioPresentationStorageSubscriptionTests() {
  it('filters unrelated storage changes before notifying subscribers', () => {
    const listener = vi.fn();
    const storageListeners: Array<
      (changes: Record<string, { newValue?: unknown }>, areaName: chrome.storage.AreaName) => void
    > = [];
    browserStorageMock.subscribeToChanges.mockImplementation((nextListener) => {
      storageListeners.push(nextListener);
      return vi.fn();
    });

    subscribeToScenarioPresentationSessionStorage('session-1', listener);

    const emitStorageChange = storageListeners[0];
    expect(emitStorageChange).toBeDefined();
    emitStorageChange?.(
      { 'scenarioPresentationSession:session-1': { newValue: createState() } },
      'local'
    );
    emitStorageChange?.({ other: { newValue: createState() } }, 'session');
    emitStorageChange?.(
      { 'scenarioPresentationSession:session-1': { newValue: createState({ revision: 2 }) } },
      'session'
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(createState({ revision: 2 }));
  });
}

function registerScenarioPresentationStorageMutationQueueTests() {
  it('serializes mutations per session and recovers after a rejected mutation', async () => {
    const calls: string[] = [];

    await expect(
      runScenarioPresentationSessionMutation('session-1', async () => {
        calls.push('first');
        throw new Error('write failed');
      })
    ).rejects.toThrow('write failed');

    await expect(
      Promise.all([
        runScenarioPresentationSessionMutation('session-1', async () => {
          calls.push('second');
          return 'second-result';
        }),
        runScenarioPresentationSessionMutation('session-1', async () => {
          calls.push('third');
          return 'third-result';
        }),
      ])
    ).resolves.toEqual(['second-result', 'third-result']);
    expect(calls).toEqual(['first', 'second', 'third']);
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
    status: SCENARIO_PRESENTATION_SESSION_STATUS.active,
    ...patch,
  };
}
