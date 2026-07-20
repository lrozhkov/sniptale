import { useEffect, useRef, useState } from 'react';
import { getProjectAsset } from '../../../composition/persistence/projects/index';
import { getRecording } from '../../../composition/persistence/recordings/index';
import { getScenarioAsset } from '../../../composition/persistence/scenario/projects';
import type { VideoProject } from '../../../features/video/project/types/index';

export async function loadVideoEditorAssetUrl(
  asset: VideoProject['assets'][number]
): Promise<readonly [string, string] | null> {
  if (asset.source.kind === 'recording') {
    const entry = await getRecording(asset.source.recordingId);
    return entry ? [asset.id, URL.createObjectURL(entry.blob)] : null;
  }

  if (asset.source.kind === 'scenario-asset') {
    const entry = await getScenarioAsset(asset.source.scenarioAssetId);
    return entry ? [asset.id, URL.createObjectURL(entry.blob)] : null;
  }

  const entry = await getProjectAsset(asset.source.projectAssetId);
  return entry ? [asset.id, URL.createObjectURL(entry.blob)] : null;
}

export function revokeVideoEditorAssetUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function cleanupRemovedAssets(cache: Record<string, string>, nextAssetIds: Set<string>): void {
  Object.entries(cache).forEach(([assetId, url]) => {
    if (!nextAssetIds.has(assetId)) {
      revokeVideoEditorAssetUrl(url);
      delete cache[assetId];
    }
  });
}

function applyLoadedAssetPairs(
  cache: Record<string, string>,
  pairs: Array<readonly [string, string] | null>
) {
  pairs.forEach((pair) => {
    if (pair) {
      cache[pair[0]] = pair[1];
    }
  });
}

function getVideoProjectAssetPlanKey(project: VideoProject | null): string | null {
  if (!project) {
    return null;
  }

  return project.assets
    .map((asset) =>
      asset.source.kind === 'recording'
        ? `${asset.id}:recording:${asset.source.recordingId}`
        : asset.source.kind === 'scenario-asset'
          ? `${asset.id}:scenario-asset:${asset.source.scenarioAssetId}`
          : `${asset.id}:project-asset:${asset.source.projectAssetId}`
    )
    .join('|');
}

function useStableVideoProjectAssets(
  project: VideoProject | null
): readonly VideoProject['assets'][number][] | null {
  const assetPlanKeyRef = useRef<string | null>(null);
  const assetPlanRef = useRef<readonly VideoProject['assets'][number][] | null>(null);
  const nextAssetPlanKey = getVideoProjectAssetPlanKey(project);

  if (nextAssetPlanKey === null) {
    assetPlanKeyRef.current = null;
    assetPlanRef.current = null;
    return null;
  }

  if (assetPlanKeyRef.current !== nextAssetPlanKey) {
    assetPlanKeyRef.current = nextAssetPlanKey;
    assetPlanRef.current = project?.assets ?? [];
  }

  return assetPlanRef.current;
}

async function loadMissingAssetUrls(
  assets: readonly VideoProject['assets'][number][],
  cache: Record<string, string>
) {
  const missingAssets = assets.filter((asset) => !cache[asset.id]);
  return Promise.all(missingAssets.map((asset) => loadVideoEditorAssetUrl(asset)));
}

/**
 * Resolves object URLs for persisted project assets and revokes stale entries.
 */
export function useVideoEditorAssetUrls(project: VideoProject | null): Record<string, string> {
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const assetUrlCacheRef = useRef<Record<string, string>>({});
  const stableAssets = useStableVideoProjectAssets(project);

  useEffect(() => {
    return () => {
      Object.values(assetUrlCacheRef.current).forEach(revokeVideoEditorAssetUrl);
      assetUrlCacheRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!stableAssets) {
      cleanupRemovedAssets(assetUrlCacheRef.current, new Set());
      setAssetUrls({});
      return;
    }

    let cancelled = false;
    const knownAssetIds = new Set(stableAssets.map((asset) => asset.id));
    cleanupRemovedAssets(assetUrlCacheRef.current, knownAssetIds);

    const loadMissingUrls = async () => {
      const pairs = await loadMissingAssetUrls(stableAssets, assetUrlCacheRef.current);

      if (cancelled) {
        pairs.forEach((pair) => pair && revokeVideoEditorAssetUrl(pair[1]));
        return;
      }

      applyLoadedAssetPairs(assetUrlCacheRef.current, pairs);
      setAssetUrls({ ...assetUrlCacheRef.current });
    };

    setAssetUrls({ ...assetUrlCacheRef.current });
    void loadMissingUrls();
    return () => {
      cancelled = true;
    };
  }, [stableAssets]);

  return assetUrls;
}
