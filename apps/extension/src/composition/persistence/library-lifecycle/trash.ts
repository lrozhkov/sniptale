import {
  readStoredVideoWorkspaceProject,
  writeVideoWorkspaceProject,
} from '../review-workspaces/project-commands';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { readWorkspaceStorage } from '../review-workspaces/storage';
import { createScenarioProjectStore, getScenarioStoredProject } from '../scenario/storage';
import { withVideoProjectUsage } from '../media-library/usage-index-keys';
import {
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
  SCENARIO_EXPORTS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioProjectEntry, parseScenarioExportEntry } from '../scenario/read-guards';
import { createLibraryLifecycle, type LibraryLifecycle } from './contracts';
import type { LibraryLifecycleTarget } from './promotion';

export type LibraryTrashTarget =
  | LibraryLifecycleTarget
  | { kind: 'scenario-export'; id: string }
  | { kind: 'quick-edit-project'; id: string; expectedRevision: number };

const TRASH_LOCK = 'sniptale:library-trash';
let testQueue: Promise<unknown> = Promise.resolve();

/** A stale deletion preview must never delete an aggregate restored in another page. */
export class StaleTrashItemError extends Error {
  constructor() {
    super('The item is no longer in the expected Trash state.');
    this.name = 'StaleTrashItemError';
  }
}

/** Serialize lifecycle admission with existing Trash move, restore and purge operations. */
export function runWithLibraryTrashMutation<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(TRASH_LOCK, { mode: 'exclusive' }, operation);
  if (typeof chrome !== 'undefined')
    return Promise.reject(new Error('Trash mutation coordination is unavailable.'));
  const execution = testQueue.then(operation);
  testQueue = execution.catch(() => undefined);
  return execution;
}

function targetStore(target: LibraryTrashTarget) {
  if (target.kind === 'quick-edit-project') return VIDEO_WORKSPACES_STORE;
  return target.kind === 'media'
    ? MEDIA_LIBRARY_STORE
    : target.kind === 'scenario-project'
      ? SCENARIO_PROJECTS_STORE
      : target.kind === 'video-project'
        ? VIDEO_PROJECTS_STORE
        : SCENARIO_EXPORTS_STORE;
}

function parseTarget(target: LibraryTrashTarget, value: unknown) {
  if (target.kind === 'quick-edit-project') {
    const parsed = parseVideoWorkspace(value);
    if (!parsed || parsed.aggregateId !== target.id || parsed.revision !== target.expectedRevision)
      return null;
    const workspace = materializeVideoWorkspaceProject(parsed, target.id);
    return { ...workspace, lifecycle: workspace.project.lifecycle };
  }
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
  if (target.kind === 'quick-edit-project') throw new StaleTrashItemError();
  if (target.kind === 'video-project') return withVideoProjectUsage({ ...entry, lifecycle });
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
  await runWithLibraryTrashMutation(() =>
    runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          MEDIA_LIBRARY_STORE,
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          SCENARIO_PROJECTS_STORE,
          SCENARIO_PROJECT_HISTORY_STORE,
          SCENARIO_PROJECT_UNITS_STORE,
          VIDEO_PROJECTS_STORE,
          SCENARIO_EXPORTS_STORE,
        ],
        'readwrite'
      );
      try {
        for (const target of targets) {
          if (target.kind === 'quick-edit-project') {
            const { workspace } = await readStoredVideoWorkspaceProject(tx, target.id);
            if (workspace.revision !== target.expectedRevision) throw new StaleTrashItemError();
            const lifecycle = workspace.project.lifecycle;
            if (restore ? lifecycle.trashedAt === undefined : lifecycle.trashedAt !== undefined)
              continue;
            const { trashedAt, ...active } = lifecycle;
            await writeVideoWorkspaceProject(
              tx,
              target.id,
              target.expectedRevision,
              {
                ...workspace.project,
                lifecycle: restore
                  ? { ...active, updatedAt: Math.max(now, trashedAt ?? 0, lifecycle.updatedAt + 1) }
                  : { ...lifecycle, trashedAt: Math.max(now, lifecycle.updatedAt + 1) },
              },
              now
            );
            continue;
          }
          const store =
            target.kind === 'scenario-project'
              ? createScenarioProjectStore(tx)
              : tx.objectStore(targetStore(target));
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

async function readTrashTarget(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  target: LibraryTrashTarget
): Promise<unknown> {
  if (target.kind === 'scenario-project') return getScenarioStoredProject(db, target.id);
  if (target.kind !== 'quick-edit-project') return db.get(targetStore(target), target.id);
  const tx = db.transaction([VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE], 'readonly');
  const value = (await readWorkspaceStorage(tx, target.id)).logical;
  await tx.done;
  return value;
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
  return runWithLibraryTrashMutation(async () => {
    await runWithIndexedDbMutation(async (db) => {
      const entry = parseTarget(target, await readTrashTarget(db, target));
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
  return runWithLibraryTrashMutation(async () => {
    if (
      !Number.isFinite(expected.updatedAt) ||
      expected.updatedAt < 0 ||
      (expected.trashedAt !== undefined &&
        (!Number.isFinite(expected.trashedAt) || expected.trashedAt < 0))
    )
      throw new StaleTrashItemError();
    await runWithIndexedDbMutation(async (db) => {
      const entry = parseTarget(target, await readTrashTarget(db, target));
      if (!entry) throw new StaleTrashItemError();
      const lifecycle = entry.lifecycle ?? createLibraryLifecycle('library', entry.updatedAt);
      if (lifecycle.updatedAt !== expected.updatedAt || lifecycle.trashedAt !== expected.trashedAt)
        throw new StaleTrashItemError();
    });
    return operation();
  });
}
