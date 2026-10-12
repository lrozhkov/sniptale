import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';
import type { VideoWorkspace } from './contracts';

/** Authored source closure includes disabled baseline and both sides of retained redo. */
export function collectReviewAnnotationEffectSnapshotIds(
  workspace: Pick<VideoWorkspace, 'advanced' | 'history'>
): ReadonlySet<string> {
  const ids = new Set<string>();
  const collect = (content: QuickEditAdvancedContent) => {
    for (const instance of content.annotationEffects?.instances ?? []) ids.add(instance.snapshotId);
  };
  collect(workspace.advanced);
  for (const operation of workspace.history) {
    if (operation.target !== 'advancedContent') continue;
    collect(operation.before);
    collect(operation.after);
  }
  return ids;
}

/** Branch/reset prune only registry entries absent from the complete retained history. */
export function pruneReviewAnnotationEffectSnapshots(workspace: VideoWorkspace): VideoWorkspace {
  if (!workspace.effectSnapshots) return workspace;
  const ids = collectReviewAnnotationEffectSnapshotIds(workspace);
  return {
    ...workspace,
    effectSnapshots: workspace.effectSnapshots.filter((value) => ids.has(value.id)),
  };
}

/** Proposes only resources removed from authored closure, excluding automatic history expiry. */
export function collectExplicitlyRemovedReviewEffectAssets(
  previous: VideoWorkspace,
  candidate: VideoWorkspace
): ReadonlySet<string> {
  const before = collectReviewAnnotationEffectSnapshotIds(previous);
  const after = collectReviewAnnotationEffectSnapshotIds(candidate);
  return new Set(
    (previous.effectSnapshots ?? [])
      .filter((snapshot) => before.has(snapshot.id) && !after.has(snapshot.id))
      .flatMap((snapshot) => snapshot.assets.map((asset) => asset.assetId))
  );
}

/** Exact resource ownership cannot be conferred by an unused immutable source alone. */
export function reviewWorkspaceHasAnnotationEffectResource(
  workspace: VideoWorkspace,
  claim: { sourceAssetId: string; snapshotId: string; resourceId: string; sha256: string },
  resource: { assetId: string; mimeType: string; byteLength: number }
): boolean {
  return (
    workspace.sourceAssetId === claim.sourceAssetId &&
    collectReviewAnnotationEffectSnapshotIds(workspace).has(claim.snapshotId) &&
    !!workspace.effectSnapshots
      ?.find((value) => value.id === claim.snapshotId)
      ?.assets.some(
        (asset) =>
          asset.id === claim.resourceId &&
          asset.sha256 === claim.sha256 &&
          asset.assetId === resource.assetId &&
          asset.mimeType === resource.mimeType &&
          asset.byteLength === resource.byteLength
      )
  );
}
