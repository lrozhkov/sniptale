import { afterEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../../composition/persistence/review-workspaces/store.test-support';
import { acquireAssetResourceSession } from '../../composition/persistence/assets/resource-sessions';
import { deleteVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-commands';
import {
  openVideoWorkspace,
  readVideoWorkspace,
} from '../../composition/persistence/review-workspaces/store';
import { createVideoReviewSession } from './session';
import { reviewSessionPersistence } from './session-durable-access';

const harness = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: harness.database,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
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
afterEach(() => vi.unstubAllGlobals());

it('no deleted text returns: delayed editor write, purge retry, and same-identity recreation', async () => {
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
  const reader = await acquireAssetResourceSession();
  const initial = await openVideoWorkspace(id, source);
  let resume!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const oldEditor = createVideoReviewSession(initial, {
    ...reviewSessionPersistence,
    saveVideoWorkspaceDraft: async (args) => {
      entered();
      await pending;
      return reviewSessionPersistence.saveVideoWorkspaceDraft(args);
    },
  });
  const annotation = {
    id: 'old',
    text: 'Deleted project text',
    anchor: { kind: 'point' as const, time: 1 },
  };
  const delayedWrite = oldEditor.saveDraft(annotation, null);
  await started;
  try {
    let purgedWhileLive = false;
    try {
      await deleteVideoWorkspaceProject(id, initial.workspace.revision);
      purgedWhileLive = true;
    } catch (error) {
      expect(error).toMatchObject({ code: 'conflict' });
    }
    // Reproduce the ABA write if purge incorrectly admitted the still-live editor.
    if (purgedWhileLive) await openVideoWorkspace(id, source);
    expect((await readVideoWorkspace(id))?.draft).toBeNull();
    resume();
    await delayedWrite;
    await oldEditor.dispose();
    await reader.release();
    if (!purgedWhileLive) {
      await deleteVideoWorkspaceProject(id, initial.workspace.revision);
      expect(await readVideoWorkspace(id)).toBeNull();
    }
    const recreated = await openVideoWorkspace(id, source);
    expect(recreated.workspace.revision).toBe(initial.workspace.revision);
    await expect(oldEditor.saveDraft(annotation, null)).rejects.toThrow('closed');
    expect(await readVideoWorkspace(id)).toEqual(recreated);
    expect(
      recreated.draft,
      'Deleted project text must not return through a delayed old editor write'
    ).toBeNull();
    expect(purgedWhileLive).toBe(false);
    expect(recreated.workspace.history).toEqual([]);
  } finally {
    resume();
    await delayedWrite.catch(() => undefined);
    await oldEditor.dispose();
    await reader.release();
  }
});
