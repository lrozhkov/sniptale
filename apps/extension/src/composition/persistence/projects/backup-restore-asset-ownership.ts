import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { videoEntryIsUnrelated, reviewWorkspaceUsesMedia } from '../media-library/dependencies';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import type { StoredProjectExportEntry, VideoProjectEntry } from './contracts';
import { parseProjectExportEntry, parseVideoProjectEntry } from './read-guards';
import { scenarioChildIsUnrelated } from '../media-library/dependencies';

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
  scenarioAssets: ListStore;
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
  const ownedReviews = await args.stores.videoWorkspaces.getAll();
  let expanded = true;
  while (expanded) {
    const previousSize = owned.size;
    for (const raw of ownedReviews) {
      const review = parseVideoWorkspace(raw);
      if (review && targetAggregates.has(review.aggregateId)) addReviewAssetIds(review, owned);
    }
    for (const id of owned) targetAggregates.add(`${PROJECT_ASSET_PREFIX}${id}`);
    expanded = owned.size !== previousSize;
  }
  await classifyReviewAssetIds({
    owned,
    protectedIds,
    targetAggregates,
    videoWorkspaces: args.stores.videoWorkspaces,
  });
  const [rawProjects, rawReviews] = await Promise.all([
    args.stores.projects.getAll(),
    args.stores.videoWorkspaces.getAll(),
  ]);
  const rawChildren = await args.stores.scenarioAssets.getAll();
  for (const projectAssetId of owned) {
    const target = {
      id: `${PROJECT_ASSET_PREFIX}${projectAssetId}`,
      source: { kind: 'project-asset' as const, projectAssetId },
    };
    const videoUses = rawProjects.some(
      (raw) =>
        !(isRecord(raw) && raw['id'] === args.projectId) &&
        !videoEntryIsUnrelated(raw, target, new Set())
    );
    const reviewUses = rawReviews.some((raw) => {
      if (
        isRecord(raw) &&
        typeof raw['aggregateId'] === 'string' &&
        targetAggregates.has(raw['aggregateId'])
      )
        return false;
      const review = parseVideoWorkspace(raw);
      return !review || reviewWorkspaceUsesMedia(review, target);
    });
    if (
      videoUses ||
      reviewUses ||
      rawChildren.some((child) => !scenarioChildIsUnrelated(child, target))
    )
      protectedIds.add(projectAssetId);
  }
  protectRetainedReviewChildren(rawReviews, owned, protectedIds);
  return { owned, protected: protectedIds };
}

function protectRetainedReviewChildren(
  rawReviews: readonly unknown[],
  owned: ReadonlySet<string>,
  protectedIds: Set<string>
): void {
  let expanded = true;
  while (expanded) {
    const previousSize = protectedIds.size;
    for (const raw of rawReviews) {
      if (
        !isRecord(raw) ||
        typeof raw['aggregateId'] !== 'string' ||
        !raw['aggregateId'].startsWith(PROJECT_ASSET_PREFIX) ||
        !protectedIds.has(raw['aggregateId'].slice(PROJECT_ASSET_PREFIX.length))
      )
        continue;
      const review = parseVideoWorkspace(raw);
      if (review) addReviewAssetIds(review, protectedIds);
      else for (const id of owned) protectedIds.add(id);
    }
    expanded = protectedIds.size !== previousSize;
  }
}
