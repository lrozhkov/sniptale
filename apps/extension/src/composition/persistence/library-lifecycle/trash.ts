import {
  MEDIA_LIBRARY_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_EXPORTS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioProjectEntry, parseScenarioExportEntry } from '../scenario/read-guards';
import { createLibraryLifecycle, type LibraryLifecycle } from './contracts';
import type { LibraryLifecycleTarget } from './promotion';

export type LibraryTrashTarget = LibraryLifecycleTarget | { kind: 'scenario-export'; id: string };

const TRASH_LOCK = 'sniptale:library-trash';
let testQueue: Promise<unknown> = Promise.resolve();

/** A stale deletion preview must never delete an aggregate restored in another page. */
export class StaleTrashItemError extends Error {
  constructor() {
    super('The item is no longer in the expected Trash state.');
    this.name = 'StaleTrashItemError';
  }
}

function withTrashLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(TRASH_LOCK, { mode: 'exclusive' }, operation);
  if (typeof chrome !== 'undefined')
    return Promise.reject(new Error('Trash mutation coordination is unavailable.'));
  const execution = testQueue.then(operation);
  testQueue = execution.catch(() => undefined);
  return execution;
}

function targetStore(target: LibraryTrashTarget) {
  return target.kind === 'media'
    ? MEDIA_LIBRARY_STORE
    : target.kind === 'scenario-project'
      ? SCENARIO_PROJECTS_STORE
      : target.kind === 'video-project'
        ? VIDEO_PROJECTS_STORE
        : SCENARIO_EXPORTS_STORE;
}

function parseTarget(target: LibraryTrashTarget, value: unknown) {
  if (target.kind === 'media') return parseMediaLibraryEntry(value);
  if (target.kind === 'scenario-project') return parseScenarioProjectEntry(value);
  if (target.kind === 'video-project') return parseVideoProjectEntry(value);
  const entry = parseScenarioExportEntry(value);
  if (!entry) return null;
  const updatedAt = entry.trashState?.updatedAt ?? entry.createdAt;
  return {
    ...entry,
    updatedAt,
    lifecycle: {
      ...createLibraryLifecycle('library', updatedAt),
      ...(entry.trashState?.trashedAt !== undefined
        ? { trashedAt: entry.trashState.trashedAt }
        : {}),
    },
  };
}

function encodeTargetLifecycle(
  target: LibraryTrashTarget,
  entry: NonNullable<ReturnType<typeof parseTarget>>,
  lifecycle: LibraryLifecycle
) {
  if (target.kind !== 'scenario-export') return { ...entry, lifecycle };
  const catalogue = parseScenarioExportEntry(entry);
  if (!catalogue) throw new StaleTrashItemError();
  return {
    ...catalogue,
    trashState: {
      updatedAt: lifecycle.updatedAt,
      ...(lifecycle.trashedAt !== undefined ? { trashedAt: lifecycle.trashedAt } : {}),
    },
  };
}

async function mutateTrash(
  targets: readonly LibraryTrashTarget[],
  restore: boolean,
  now: number
): Promise<void> {
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid Trash mutation time.');
  if (targets.length === 0) return;
  await withTrashLock(() =>
    runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          MEDIA_LIBRARY_STORE,
          SCENARIO_PROJECTS_STORE,
          VIDEO_PROJECTS_STORE,
          SCENARIO_EXPORTS_STORE,
        ],
        'readwrite'
      );
      try {
        for (const target of targets) {
          const store = tx.objectStore(targetStore(target));
          const entry = parseTarget(target, await store.get(target.id));
          if (!entry) throw new StaleTrashItemError();
          const lifecycle = entry.lifecycle ?? createLibraryLifecycle('library', entry.updatedAt);
          if (restore) {
            if (lifecycle.trashedAt === undefined) continue;
            const { trashedAt: _trashedAt, ...active } = lifecycle;
            // A restored draft receives a full retention window rather than expiring immediately.
            await store.put(
              encodeTargetLifecycle(target, entry, {
                ...active,
                updatedAt: Math.max(now, lifecycle.trashedAt),
              })
            );
          } else if (lifecycle.trashedAt === undefined) {
            await store.put(
              encodeTargetLifecycle(target, entry, {
                ...lifecycle,
                trashedAt: Math.max(now, lifecycle.updatedAt + 1),
              })
            );
          }
        }
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // The transaction may already have aborted.
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    })
  );
}

/** Move aggregate roots to Trash atomically without releasing their children or durable bytes. */
export function moveStoredItemsToTrash(
  targets: readonly LibraryTrashTarget[],
  now = Date.now()
): Promise<void> {
  return mutateTrash(targets, false, now);
}

/** Restore aggregate roots to their original library or temporary destination. */
export function restoreStoredItemsFromTrash(
  targets: readonly LibraryTrashTarget[],
  now = Date.now()
): Promise<void> {
  return mutateTrash(targets, true, now);
}

/**
 * Serialize a complete destructive workflow with Trash admission and restoration across pages.
 * The lock deliberately surrounds existing deletion owners, whose media branches can span
 * multiple transactions. It is acquired before persistence permits, matching move and restore.
 */
export function runWithTrashedStoredItem<T>(
  target: LibraryTrashTarget,
  expectedTrashedAt: number,
  operation: () => Promise<T>
): Promise<T> {
  return withTrashLock(async () => {
    await runWithIndexedDbMutation(async (db) => {
      const entry = parseTarget(target, await db.get(targetStore(target), target.id));
      if (!entry || entry.lifecycle?.trashedAt !== expectedTrashedAt)
        throw new StaleTrashItemError();
    });
    return operation();
  });
}

/** Bind a confirmed active or Trash purge to the lifecycle observed when opening its choice. */
export function runWithStoredItemLifecycle<T>(
  target: LibraryTrashTarget,
  expected: Pick<LibraryLifecycle, 'updatedAt' | 'trashedAt'>,
  operation: () => Promise<T>
): Promise<T> {
  return withTrashLock(async () => {
    if (
      !Number.isFinite(expected.updatedAt) ||
      expected.updatedAt < 0 ||
      (expected.trashedAt !== undefined &&
        (!Number.isFinite(expected.trashedAt) || expected.trashedAt < 0))
    )
      throw new StaleTrashItemError();
    await runWithIndexedDbMutation(async (db) => {
      const entry = parseTarget(target, await db.get(targetStore(target), target.id));
      if (!entry) throw new StaleTrashItemError();
      const lifecycle = entry.lifecycle ?? createLibraryLifecycle('library', entry.updatedAt);
      if (lifecycle.updatedAt !== expected.updatedAt || lifecycle.trashedAt !== expected.trashedAt)
        throw new StaleTrashItemError();
    });
    return operation();
  });
}
