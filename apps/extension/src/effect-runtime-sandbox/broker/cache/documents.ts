import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

const MAX_DOCUMENTS = 8;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

interface EffectRuntimeCachedDocument {
  document: EffectV1Document;
  id: string;
  source: string;
}

export interface EffectRuntimeDocumentCache {
  clear(): void;
  get(id: string): EffectRuntimeCachedDocument | null;
  set(value: EffectRuntimeCachedDocument): boolean;
  snapshot(): { entries: number; sourceBytes: number };
}

export function createEffectRuntimeDocumentCache(): EffectRuntimeDocumentCache {
  const entries = new Map<string, EffectRuntimeCachedDocument & { sourceBytes: number }>();
  let sourceBytes = 0;
  return {
    clear() {
      entries.clear();
      sourceBytes = 0;
    },
    get(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      entries.delete(id);
      entries.set(id, entry);
      return { document: entry.document, id: entry.id, source: entry.source };
    },
    set(value) {
      const bytes = new TextEncoder().encode(value.source).byteLength;
      if (bytes > MAX_SOURCE_BYTES) return false;
      const replaced = entries.get(value.id);
      if (replaced) {
        entries.delete(value.id);
        sourceBytes -= replaced.sourceBytes;
      }
      while (entries.size >= MAX_DOCUMENTS || sourceBytes + bytes > MAX_SOURCE_BYTES) {
        const oldestId = entries.keys().next().value;
        if (typeof oldestId !== 'string') return false;
        const evicted = entries.get(oldestId)!;
        entries.delete(oldestId);
        sourceBytes -= evicted.sourceBytes;
      }
      entries.set(value.id, { ...value, sourceBytes: bytes });
      sourceBytes += bytes;
      return true;
    },
    snapshot: () => ({ entries: entries.size, sourceBytes }),
  };
}
