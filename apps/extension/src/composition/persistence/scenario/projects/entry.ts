import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioProjectEntry } from '../contracts';
import { createLibraryLifecycle, updateLibraryLifecycle } from '../../library-lifecycle/contracts';
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
}): ScenarioProjectEntry {
  const updatedAt = createScenarioProjectRevision(args.existing, args.updatedAt);
  return {
    id: args.project.id,
    project: {
      ...args.project,
      updatedAt,
    },
    createdAt: args.existing?.createdAt ?? args.project.createdAt ?? updatedAt,
    updatedAt,
    lifecycle: args.existing
      ? updateLibraryLifecycle(
          args.existing.lifecycle ?? createLibraryLifecycle('library', args.existing.updatedAt),
          updatedAt
        )
      : createLibraryLifecycle(args.storageClass ?? 'library', updatedAt),
    workspaceRevision: (args.existing?.workspaceRevision ?? 0) + 1,
  };
}
