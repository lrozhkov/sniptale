import { useEffect, useMemo, useRef, useState } from 'react';
import { blobToDataUrl } from '../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import {
  getScenarioAssetBlob,
  getScenarioAssetEntry,
} from '../../composition/persistence/scenario/store/public';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioSlideRenderAsset,
  ScenarioSlideRenderAssetMap,
} from '../project/stage-render/slide';

export function useScenarioV3RenderAssets(project: ScenarioProjectV3): ScenarioSlideRenderAssetMap {
  return useScenarioV3RenderAssetState(project).assets;
}

export function useScenarioV3RenderAssetState(project: ScenarioProjectV3): {
  assets: ScenarioSlideRenderAssetMap;
  loading: boolean;
} {
  const assetKey = useMemo(() => createScenarioV3AssetKey(project), [project]);
  const assetIds = useMemo(() => parseScenarioV3AssetKey(assetKey), [assetKey]);
  const loadRevisionRef = useRef(0);
  const [assets, setAssets] = useState<ReadonlyMap<string, ScenarioSlideRenderAsset>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const revision = loadRevisionRef.current + 1;
    loadRevisionRef.current = revision;

    if (assetIds.length === 0) {
      setAssets(new Map());
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    void loadScenarioV3RenderAssets(assetIds).then((nextAssets) => {
      if (active && loadRevisionRef.current === revision) {
        setAssets(nextAssets);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [assetIds]);

  return { assets, loading };
}

async function loadScenarioV3RenderAssets(
  assetIds: readonly string[]
): Promise<ReadonlyMap<string, ScenarioSlideRenderAsset>> {
  const entries = await Promise.all(assetIds.map(loadScenarioV3RenderAssetEntry));
  return new Map(entries.filter((entry) => entry !== null));
}

async function loadScenarioV3RenderAssetEntry(
  assetId: string
): Promise<readonly [string, ScenarioSlideRenderAsset] | null> {
  try {
    const [blob, metadata] = await Promise.all([
      getScenarioAssetBlob(assetId),
      getScenarioAssetEntry(assetId),
    ]);
    if (!blob) {
      return null;
    }

    const [source, dimensions] = await Promise.all([
      blobToDataUrl(blob),
      measureScenarioV3RenderAssetDimensions(blob, metadata),
    ]);
    return [assetId, { height: dimensions.height, source, width: dimensions.width }];
  } catch {
    return null;
  }
}

async function measureScenarioV3RenderAssetDimensions(
  blob: Blob,
  metadata: { height: number; width: number } | undefined
): Promise<{ height: number | null; width: number | null }> {
  try {
    return await measureImageBlob(blob);
  } catch {
    return {
      height: metadata?.height ?? null,
      width: metadata?.width ?? null,
    };
  }
}

function createScenarioV3AssetKey(project: ScenarioProjectV3): string {
  return collectScenarioV3ImageAssetIds(project).join('\n');
}

function parseScenarioV3AssetKey(assetKey: string): string[] {
  return assetKey ? assetKey.split('\n') : [];
}

function collectScenarioV3ImageAssetIds(project: ScenarioProjectV3): string[] {
  const assetIds = new Set<string>();
  for (const slide of collectScenarioV3AssetSlides(project)) {
    for (const element of slide.elements) {
      if (element.kind === SCENARIO_V3_ELEMENT_KINDS.image && element.assetRef.assetId) {
        assetIds.add(element.assetRef.assetId);
      }
    }
  }

  return Array.from(assetIds).sort();
}

function collectScenarioV3AssetSlides(project: ScenarioProjectV3): ScenarioSlide[] {
  return [...project.slides, ...project.trash.map((entry) => entry.slide)];
}
