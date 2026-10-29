// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../../composition/persistence/review-workspaces/store.test-support';
import { deleteVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-commands';
import {
  openVideoWorkspace,
  readVideoWorkspace,
} from '../../composition/persistence/review-workspaces/store';
import { useLoadedReview } from './use-session';
const harness = vi.hoisted(() => ({ database: vi.fn(), load: vi.fn(), beforeMutation: vi.fn() }));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: harness.database,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) => {
    await harness.beforeMutation();
    return operation(await harness.database());
  },
}));
vi.mock('../../composition/persistence/infrastructure/mutation-barrier', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/mutation-barrier')
  >()),
  runWithDurableAssetLifecycleLock: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('../../composition/persistence/assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));

vi.mock('../../workflows/video-review/source', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: harness.load,
}));
afterEach(() => vi.unstubAllGlobals());

it('a cancelled opening cannot recreate a purged project: drain the writer before retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('chrome', undefined);
  let readers = 0;
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        options: { mode: string },
        action: (lock: object | null) => Promise<unknown>
      ) => {
        if (options.mode === 'exclusive') return action(readers ? null : {});
        readers++;
        try {
          return await action({});
        } finally {
          readers--;
        }
      },
    },
  });
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  harness.database.mockResolvedValue(fixture.database);
  const id = 'recording:beta-v1-recording';
  const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
  const initial = await openVideoWorkspace(id, source);
  let resume!: () => void;
  let entered!: () => void;
  let settled!: () => void;
  const held = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    settled = resolve;
  });
  harness.beforeMutation.mockImplementationOnce(async () => {
    entered();
    await held;
  });
  harness.load.mockImplementation(async (_id: string, signal: AbortSignal) => {
    try {
      const snapshot = await openVideoWorkspace(id, source);
      signal.throwIfAborted();
      return {
        snapshot,
        file: new Blob(['video']),
        filename: 'source.webm',
        source,
        telemetry: null,
      };
    } finally {
      settled();
    }
  });
  function Editor() {
    useLoadedReview(id);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Editor />));
    await started;
    await act(async () => root.render(null));
    let purgedWhileOpening = false;
    try {
      await deleteVideoWorkspaceProject(id, initial.workspace.revision);
      purgedWhileOpening = true;
    } catch (error) {
      expect(error).toMatchObject({ code: 'conflict' });
    }
    await act(async () => {
      resume();
      await finished;
    });
    if (!purgedWhileOpening) await deleteVideoWorkspaceProject(id, initial.workspace.revision);
    expect(
      await readVideoWorkspace(id),
      'Cancelled opening must not recreate a successfully purged project'
    ).toBeNull();
    expect(purgedWhileOpening).toBe(false);
    expect(readers).toBe(0);
  } finally {
    resume();
    await act(async () => {
      await finished;
      root.unmount();
    });
  }
});

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));
