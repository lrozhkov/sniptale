const MAX_ASSET_SELECTIONS = 64;

export interface EffectRuntimeAssetSelectionCache {
  clear(): void;
  has(id: string): boolean;
  set(id: string): void;
  snapshot(): { entries: number };
}

export function createEffectRuntimeAssetSelectionCache(): EffectRuntimeAssetSelectionCache {
  const entries = new Set<string>();
  return {
    clear: () => entries.clear(),
    has(id) {
      if (!entries.delete(id)) return false;
      entries.add(id);
      return true;
    },
    set(id) {
      entries.delete(id);
      while (entries.size >= MAX_ASSET_SELECTIONS) {
        const oldest = entries.values().next().value;
        if (typeof oldest !== 'string') break;
        entries.delete(oldest);
      }
      entries.add(id);
    },
    snapshot: () => ({ entries: entries.size }),
  };
}
