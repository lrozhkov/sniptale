// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRecommendedContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { installPersistenceLockManagerForTests } from '../../../../../composition/persistence/infrastructure/mutation-barrier';
import {
  CONTEXT_MENU_PENDING_DRAFT_KEY,
  clearPendingContextMenuDraft,
  keepPendingContextMenuDraft,
  readPendingContextMenuDraft,
} from './context-menu-draft-recovery';

afterEach(() => {
  installPersistenceLockManagerForTests(null);
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it('waits for mutation admission before publishing a recoverable draft', async () => {
  let admit!: () => void;
  const admission = new Promise<void>((resolve) => {
    admit = resolve;
  });
  const request = vi.fn();
  installPersistenceLockManagerForTests({
    async request<T>(name: string, options: unknown, operation: () => T | Promise<T>) {
      request(name, options, operation);
      await admission;
      return operation();
    },
  });
  const tree = createRecommendedContextMenuTree([], []);
  const pending = keepPendingContextMenuDraft(tree);
  expect(window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY)).toBeNull();
  expect(request).toHaveBeenCalledWith(
    'sniptale:persistence:privacy-erasure',
    { mode: 'shared', ifAvailable: true },
    expect.any(Function)
  );
  admit();
  expect(await pending).toBe(true);
  expect(readPendingContextMenuDraft()).toEqual(tree);
});

it('checks the expected draft after admission so late cleanup preserves a newer edit', async () => {
  const oldTree = createRecommendedContextMenuTree([], []);
  const newerTree = { ...oldTree, nodes: [...oldTree.nodes].reverse() };
  await keepPendingContextMenuDraft(oldTree);
  let admit!: () => void;
  const admission = new Promise<void>((resolve) => {
    admit = resolve;
  });
  installPersistenceLockManagerForTests({
    async request<T>(_name: string, _options: unknown, operation: () => T | Promise<T>) {
      await admission;
      return operation();
    },
  });
  const cleanup = clearPendingContextMenuDraft(oldTree);
  window.localStorage.setItem(CONTEXT_MENU_PENDING_DRAFT_KEY, JSON.stringify(newerTree));
  admit();
  await cleanup;
  expect(readPendingContextMenuDraft()).toEqual(newerTree);
});

it('does not republish a draft when privacy erasure refuses immediate admission', async () => {
  const tree = createRecommendedContextMenuTree([], []);
  installPersistenceLockManagerForTests({
    async request<T>(
      _name: string,
      _options: unknown,
      operation: (lock?: unknown) => T | Promise<T>
    ) {
      return operation(null);
    },
  });
  expect(await keepPendingContextMenuDraft(tree)).toBe(false);
  expect(readPendingContextMenuDraft()).toBeNull();
});

it('fails softly when mutation admission or local storage is unavailable', async () => {
  installPersistenceLockManagerForTests({
    request: async () => {
      throw new Error('unavailable');
    },
  });
  const tree = createRecommendedContextMenuTree([], []);
  expect(await keepPendingContextMenuDraft(tree)).toBe(false);
  await expect(
    Promise.resolve().then(() => clearPendingContextMenuDraft(tree))
  ).resolves.toBeUndefined();
  installPersistenceLockManagerForTests(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(await keepPendingContextMenuDraft(tree)).toBe(false);
});
