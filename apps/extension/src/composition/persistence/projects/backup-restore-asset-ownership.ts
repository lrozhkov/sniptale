import type { VideoWorkspace } from '../review-workspaces/contracts';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import type { StoredProjectExportEntry, VideoProjectEntry } from './contracts';
import { parseProjectExportEntry, parseVideoProjectEntry } from './read-guards';

const PROJECT_ASSET_PREFIX = 'project-asset:';

interface ListStore {
  getAll(): Promise<unknown[]>;
}

interface ProjectExportListStore {
  index(name: 'projectId'): { getAll(projectId: string): Promise<unknown[]> };
}

interface ProjectAssetOwnershipStores {
  exports: ProjectExportListStore;
  projects: ListStore;
  videoWorkspaces: ListStore;
}

export interface ProjectAssetOwnership {
  owned: ReadonlySet<string>;
  protected: ReadonlySet<string>;
}

function projectAssetIds(entry: VideoProjectEntry): Set<string> {
  return new Set(
    entry.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    )
  );
}

function addReviewAssetIds(workspace: VideoWorkspace, into: Set<string>): void {
  for (const reference of collectReviewAssetReferences(workspace)) {
    into.add(reference.slice(PROJECT_ASSET_PREFIX.length));
  }
}

async function collectTargetAggregates(
  projectId: string,
  owned: ReadonlySet<string>,
  exports: ProjectExportListStore
): Promise<Set<string>> {
  const aggregates = new Set([...owned].map((id) => `${PROJECT_ASSET_PREFIX}${id}`));
  const rows = await exports.index('projectId').getAll(projectId);
  for (const raw of rows) {
    const entry: StoredProjectExportEntry | null = parseProjectExportEntry(raw);
    if (entry) aggregates.add(`export:${entry.id}`);
  }
  return aggregates;
}

async function collectOtherDirectAssetIds(
  projectId: string,
  projects: ListStore
): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  for (const raw of await projects.getAll()) {
    const project = parseVideoProjectEntry(raw);
    if (!project || project.id === projectId) continue;
    for (const id of projectAssetIds(project)) protectedIds.add(id);
  }
  return protectedIds;
}

async function classifyReviewAssetIds(args: {
  owned: Set<string>;
  protectedIds: Set<string>;
  targetAggregates: ReadonlySet<string>;
  videoWorkspaces: ListStore;
}): Promise<void> {
  for (const raw of await args.videoWorkspaces.getAll()) {
    const workspace = parseVideoWorkspace(raw);
    if (!workspace) continue;
    const targetOwned = args.targetAggregates.has(workspace.aggregateId);
    if (targetOwned) addReviewAssetIds(workspace, args.owned);
    const sourceAssetId = workspace.aggregateId.startsWith(PROJECT_ASSET_PREFIX)
      ? workspace.aggregateId.slice(PROJECT_ASSET_PREFIX.length)
      : null;
    if (!targetOwned || (sourceAssetId && args.protectedIds.has(sourceAssetId))) {
      addReviewAssetIds(workspace, args.protectedIds);
    }
  }
}

export async function collectProjectAssetOwnership(args: {
  existing: VideoProjectEntry | null;
  projectId: string;
  stores: ProjectAssetOwnershipStores;
}): Promise<ProjectAssetOwnership> {
  const owned = args.existing ? projectAssetIds(args.existing) : new Set<string>();
  const [targetAggregates, protectedIds] = await Promise.all([
    collectTargetAggregates(args.projectId, owned, args.stores.exports),
    collectOtherDirectAssetIds(args.projectId, args.stores.projects),
  ]);
  await classifyReviewAssetIds({
    owned,
    protectedIds,
    targetAggregates,
    videoWorkspaces: args.stores.videoWorkspaces,
  });
  return { owned, protected: protectedIds };
}
