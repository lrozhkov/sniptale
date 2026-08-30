import { useEffect, useRef, useState } from 'react';
import { getProjectAsset } from '../../../composition/persistence/projects/index';
import { getRecording } from '../../../composition/persistence/recordings/index';
import { getScenarioAsset } from '../../../composition/persistence/scenario/projects';
import type { VideoProject } from '../../../features/video/project/types/index';

interface VideoEditorAssetUrlEntry {
  sourceFingerprint: string;
  url: string;
}

interface LoadedVideoEditorAssetUrl extends VideoEditorAssetUrlEntry {
  assetId: string;
}

type VideoEditorAssetUrlCache = Record<string, VideoEditorAssetUrlEntry>;

function getVideoEditorAssetSourceFingerprint(asset: VideoProject['assets'][number]): string {
  if (asset.source.kind === 'recording') {
    return `recording:${asset.source.recordingId}`;
  }

  if (asset.source.kind === 'scenario-asset') {
    return `scenario-asset:${asset.source.scenarioAssetId}`;
  }

  return `project-asset:${asset.source.projectAssetId}`;
}

async function loadVideoEditorAssetUrl(
  asset: VideoProject['assets'][number]
): Promise<LoadedVideoEditorAssetUrl | null> {
  const sourceFingerprint = getVideoEditorAssetSourceFingerprint(asset);

  if (asset.source.kind === 'recording') {
    const entry = await getRecording(asset.source.recordingId);
    return entry
      ? { assetId: asset.id, sourceFingerprint, url: URL.createObjectURL(entry.file) }
      : null;
  }

  if (asset.source.kind === 'scenario-asset') {
    const entry = await getScenarioAsset(asset.source.scenarioAssetId);
    return entry
      ? { assetId: asset.id, sourceFingerprint, url: URL.createObjectURL(entry.file) }
      : null;
  }

  const entry = await getProjectAsset(asset.source.projectAssetId);
  if (entry.status === 'ready') {
    return { assetId: asset.id, sourceFingerprint, url: URL.createObjectURL(entry.entry.file) };
  }
  if (entry.status === 'not-found') return null;
  throw new Error(`Project asset ${asset.source.projectAssetId} ${entry.status}.`);
}

function revokeVideoEditorAssetUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function cleanupStaleAssets(
  cache: VideoEditorAssetUrlCache,
  nextSourcesByAssetId: ReadonlyMap<string, string>
): void {
  Object.entries(cache).forEach(([assetId, entry]) => {
    if (nextSourcesByAssetId.get(assetId) !== entry.sourceFingerprint) {
      revokeVideoEditorAssetUrl(entry.url);
      delete cache[assetId];
    }
  });
}

function applyLoadedAssetUrls(
  cache: VideoEditorAssetUrlCache,
  loadedAssetUrls: readonly (LoadedVideoEditorAssetUrl | null)[]
): void {
  loadedAssetUrls.forEach((loadedAssetUrl) => {
    if (loadedAssetUrl) {
      const previousEntry = cache[loadedAssetUrl.assetId];
      if (previousEntry && previousEntry.url !== loadedAssetUrl.url) {
        revokeVideoEditorAssetUrl(previousEntry.url);
      }
      cache[loadedAssetUrl.assetId] = loadedAssetUrl;
    }
  });
}

function projectAssetUrlCache(cache: VideoEditorAssetUrlCache): Record<string, string> {
  return Object.fromEntries(Object.entries(cache).map(([assetId, entry]) => [assetId, entry.url]));
}

function getVideoProjectAssetPlanKey(project: VideoProject | null): string | null {
  if (!project) {
    return null;
  }

  return project.assets
    .map((asset) => `${asset.id}:${getVideoEditorAssetSourceFingerprint(asset)}`)
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
  cache: VideoEditorAssetUrlCache
) {
  const missingAssets = assets.filter(
    (asset) => cache[asset.id]?.sourceFingerprint !== getVideoEditorAssetSourceFingerprint(asset)
  );
  const results = await Promise.allSettled(
    missingAssets.map((asset) => loadVideoEditorAssetUrl(asset))
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/**
 * Resolves object URLs for persisted project assets and revokes stale entries.
 */
export function useVideoEditorAssetUrls(project: VideoProject | null): Record<string, string> {
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const assetUrlCacheRef = useRef<VideoEditorAssetUrlCache>({});
  const stableAssets = useStableVideoProjectAssets(project);

  useEffect(() => {
    return () => {
      Object.values(assetUrlCacheRef.current).forEach((entry) =>
        revokeVideoEditorAssetUrl(entry.url)
      );
      assetUrlCacheRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!stableAssets) {
      cleanupStaleAssets(assetUrlCacheRef.current, new Map());
      setAssetUrls({});
      return;
    }

    let cancelled = false;
    const nextSourcesByAssetId = new Map(
      stableAssets.map((asset) => [asset.id, getVideoEditorAssetSourceFingerprint(asset)])
    );
    cleanupStaleAssets(assetUrlCacheRef.current, nextSourcesByAssetId);

    const loadMissingUrls = async () => {
      const loadedAssetUrls = await loadMissingAssetUrls(stableAssets, assetUrlCacheRef.current);

      if (cancelled) {
        loadedAssetUrls.forEach(
          (loadedAssetUrl) => loadedAssetUrl && revokeVideoEditorAssetUrl(loadedAssetUrl.url)
        );
        return;
      }

      applyLoadedAssetUrls(assetUrlCacheRef.current, loadedAssetUrls);
      setAssetUrls(projectAssetUrlCache(assetUrlCacheRef.current));
    };

    setAssetUrls(projectAssetUrlCache(assetUrlCacheRef.current));
    void loadMissingUrls();
    return () => {
      cancelled = true;
    };
  }, [stableAssets]);

  return assetUrls;
}
