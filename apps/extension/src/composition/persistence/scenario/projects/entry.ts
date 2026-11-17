import {
  appendScenarioSavedVersion,
  retainScenarioSavedVersions,
  isScenarioHistoryActionId,
} from '../history-model';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioProjectEntry, ScenarioEditingHistory } from '../contracts';
import {
  createLibraryLifecycle,
  promoteLibraryLifecycle,
  updateLibraryLifecycle,
} from '../../library-lifecycle/contracts';
import type { LibraryStorageClass } from '../../library-lifecycle/contracts';

function createScenarioProjectRevision(
  existing: ScenarioProjectEntry | undefined,
  requestedUpdatedAt?: number
): number {
  const now = requestedUpdatedAt ?? Date.now();
  return existing ? Math.max(now, existing.project.updatedAt + 1) : now;
}

export function createScenarioProjectEntry(args: {
  existing: ScenarioProjectEntry | undefined;
  project: GuideProject;
  storageClass?: LibraryStorageClass;
  updatedAt?: number;
  historyPolicy?: 'append' | 'preserve' | 'discard';
  /**
   * Exclusive ownership requires private, freshly admitted saved and editing snapshots.
   * The caller must not expose or mutate those snapshots.
   */
  historyOwnership?: 'borrowed' | 'exclusive';
  historyActionId?: string;
  editingHistory?: ScenarioEditingHistory;
}): ScenarioProjectEntry {
  const editingHistory = args.editingHistory ?? args.existing?.editingHistory;
  if (
    args.editingHistory === undefined &&
    editingHistory !== undefined &&
    args.project !== args.existing?.project
  )
    throw new Error('Scenario editing history mutation is not available.');
  if (args.historyActionId !== undefined && !isScenarioHistoryActionId(args.historyActionId))
    throw new Error('Invalid scenario history action identity.');
  const workspaceRevision = (args.existing?.workspaceRevision ?? 0) + 1;
  if (!Number.isSafeInteger(workspaceRevision))
    throw new Error('Local Scenario revisions are exhausted.');
  const updatedAt = createScenarioProjectRevision(args.existing, args.updatedAt);
  const history =
    args.historyPolicy === 'discard'
      ? []
      : args.historyPolicy === 'preserve' ||
          (args.historyActionId !== undefined &&
            args.historyActionId === args.existing?.lastAcceptedActionId)
        ? retainScenarioSavedVersions(args.existing?.history ?? [], args.historyOwnership)
        : appendScenarioSavedVersion(args.existing, args.historyOwnership);
  return {
    ...(args.historyActionId === undefined ? {} : { lastAcceptedActionId: args.historyActionId }),
    ...(history.length ? { history } : {}),
    ...(editingHistory === undefined
      ? {}
      : {
          editingHistory:
            args.historyOwnership === 'exclusive'
              ? editingHistory
              : structuredClone(editingHistory),
        }),
    id: args.project.id,
    project: {
      ...args.project,
      updatedAt,
    },
    createdAt: args.existing?.createdAt ?? args.project.createdAt ?? updatedAt,
    updatedAt,
    lifecycle: args.existing
      ? updateLibraryLifecycle(
          promoteLibraryLifecycle(
            args.existing.lifecycle ?? createLibraryLifecycle('library', args.existing.updatedAt),
            updatedAt
          ),
          updatedAt
        )
      : createLibraryLifecycle('library', updatedAt),
    workspaceRevision,
  };
}
