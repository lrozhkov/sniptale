import type { EffectRuntimeWorkerAsset } from '../../../contracts/effect-runtime/types';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../resource-policy';

interface CachedAssetSelection {
  assets: Record<string, EffectRuntimeWorkerAsset>;
  bytes: number;
  entries: number;
}

interface EffectRuntimeWorkerAssetCache {
  clear(): void;
  get(id: string): Record<string, EffectRuntimeWorkerAsset> | null;
  set(id: string, assets: Record<string, EffectRuntimeWorkerAsset>): boolean;
  snapshot(): { bytes: number; entries: number; selections: number };
}

interface AssetCacheState {
  bytes: number;
  entries: number;
  selections: Map<string, CachedAssetSelection>;
}

export function createEffectRuntimeWorkerAssetCache(): EffectRuntimeWorkerAssetCache {
  const state: AssetCacheState = { bytes: 0, entries: 0, selections: new Map() };
  return {
    clear() {
      for (const id of state.selections.keys()) removeAssetSelection(state, id);
    },
    get(id) {
      const selection = state.selections.get(id);
      if (!selection) return null;
      state.selections.delete(id);
      state.selections.set(id, selection);
      return selection.assets;
    },
    set: (id, assets) => setAssetSelection(state, id, assets),
    snapshot: () => ({
      bytes: state.bytes,
      entries: state.entries,
      selections: state.selections.size,
    }),
  };
}

function removeAssetSelection(state: AssetCacheState, id: string): void {
  const selection = state.selections.get(id);
  if (!selection) return;
  state.selections.delete(id);
  state.bytes -= selection.bytes;
  state.entries -= selection.entries;
  closeAssets(selection.assets);
}

function exceedsAssetCacheLimit(
  state: AssetCacheState,
  charge: { bytes: number; entries: number }
): boolean {
  return (
    state.selections.size >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries ||
    state.entries + charge.entries > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries ||
    state.bytes + charge.bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
  );
}

function setAssetSelection(
  state: AssetCacheState,
  id: string,
  assets: Record<string, EffectRuntimeWorkerAsset>
): boolean {
  const charge = measureAssets(assets);
  if (
    charge.entries > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries ||
    charge.bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
  ) {
    return false;
  }
  removeAssetSelection(state, id);
  while (state.selections.size > 0 && exceedsAssetCacheLimit(state, charge)) {
    const oldest = state.selections.keys().next().value;
    if (typeof oldest !== 'string') break;
    removeAssetSelection(state, oldest);
  }
  if (exceedsAssetCacheLimit(state, charge)) return false;
  state.selections.set(id, { assets, ...charge });
  state.entries += charge.entries;
  state.bytes += charge.bytes;
  return true;
}

function closeAssets(assets: Record<string, EffectRuntimeWorkerAsset>): void {
  const bitmaps = new Set(
    Object.values(assets)
      .filter((asset) => asset.kind === 'image')
      .map(({ bitmap }) => bitmap)
  );
  for (const bitmap of bitmaps) bitmap.close();
}

function measureAssets(assets: Record<string, EffectRuntimeWorkerAsset>): {
  bytes: number;
  entries: number;
} {
  let bytes = 0;
  let entries = 0;
  for (const asset of Object.values(assets)) {
    entries += 1;
    if (asset.kind === 'image') bytes += asset.width * asset.height * 4;
  }
  return { bytes, entries };
}
