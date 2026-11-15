import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';
import {
  GPU_PREVIEW_LIMITS,
  isGroup,
  isPaintSource,
  requiresGpuPreviewFilter,
} from './gpu-preview-plan';

const MAX_IDENTITY_BYTES = 128 * 1024;
const MAX_IDENTITY_VALUES = GPU_PREVIEW_LIMITS.totalLayers * 128;
type Cache = GpuPreviewLayer['cache'];

/** Weak source identities do not extend raster leases or retain project documents. */
export function createGpuPreviewGroupContents() {
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const id = (value: object) => {
    const known = ids.get(value);
    if (known !== undefined) return known;
    if (!Number.isSafeInteger(nextId)) return undefined;
    const created = nextId++;
    ids.set(value, created);
    return created;
  };
  const cacheKey = (cache: NonNullable<Cache>) => {
    const revision = cache.revision;
    if (typeof cache.key !== 'string') return undefined;
    if (typeof revision === 'object' && revision !== null) {
      const identity = id(revision);
      return identity === undefined ? undefined : [cache.key, 'object', identity];
    }
    return typeof revision === 'string' ||
      (typeof revision === 'number' && Number.isFinite(revision))
      ? [cache.key, 'value', revision]
      : undefined;
  };

  /** One bounded reader per encode; aliases remain references, not expanded subtrees. */
  return () => {
    const memo = new WeakMap<GpuPreviewGroup, string | null>();
    let remainingLayers: number = GPU_PREVIEW_LIMITS.totalLayers;
    let remainingValues = MAX_IDENTITY_VALUES;
    let remainingBytes = MAX_IDENTITY_BYTES;
    return (root: GpuPreviewGroup): string | undefined => {
      const known = memo.get(root);
      if (known !== undefined) return known ?? undefined;
      const groups: unknown[] = [];
      const indices = new Map<GpuPreviewGroup, number>();
      const visiting = new Set<GpuPreviewGroup>();
      let available = true;
      const unavailable = () => {
        available = false;
        return null;
      };
      const source = (value: GpuPreviewLayer['source'], cache: Cache, depth: number): unknown => {
        if (value instanceof VideoFrame) return unavailable();
        if (isGroup(value)) return group(value, depth + 1);
        if (isPaintSource(value)) return ['paint', value.width, value.height, value.paint];
        if (!(typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) && !cache)
          return unavailable();
        const identity = id(value),
          version = cache ? cacheKey(cache) : null;
        if (identity === undefined || (cache && version === undefined)) return unavailable();
        return ['raster', identity, value.width, value.height, version];
      };
      const mask = (
        value: GpuPreviewLayer['alphaMask'] | GpuPreviewLayer['operationClip'],
        depth: number
      ) => {
        if (!value) return undefined;
        const { source: raster, cache, ...parameters } = value;
        return [source(raster, cache, depth), parameters];
      };
      const layer = (value: GpuPreviewLayer, depth: number): unknown => {
        if (--remainingLayers < 0) return unavailable();
        // Secondary processing has its own input contract; keep its canonical regeneration.
        if (requiresGpuPreviewFilter(value) || value.cssFilter || value.imageFilters || value.lens)
          return unavailable();
        const { source: input, cache, alphaMask, operationClip, ...parameters } = value;
        return [
          source(input, cache, depth),
          parameters,
          mask(alphaMask, depth),
          mask(operationClip, depth),
        ];
      };
      const group = (value: GpuPreviewGroup, depth: number): unknown => {
        if (depth > GPU_PREVIEW_LIMITS.groupDepth || value.composition || visiting.has(value))
          return unavailable();
        const previous = indices.get(value);
        if (previous !== undefined) return ['group', previous];
        const index = groups.length;
        indices.set(value, index);
        groups.push(null);
        visiting.add(value);
        const layers: unknown[] = [];
        for (const child of value.layers) {
          layers.push(layer(child, depth));
          if (!available) break;
        }
        visiting.delete(value);
        groups[index] = [value.output, value.logical, layers];
        return ['group', index];
      };
      group(root, 0);
      if (!available) {
        memo.set(root, null);
        return undefined;
      }
      try {
        const key = JSON.stringify(groups, (_name, value: unknown) => {
          if (--remainingValues < 0) throw new Error('GPU content identity budget exceeded.');
          if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new Error('GPU content identity is unavailable.');
            return `n${Object.is(value, -0) ? '-0' : String(value)}`;
          }
          if (typeof value === 'string') {
            if (value.length * 2 > remainingBytes)
              throw new Error('GPU content identity budget exceeded.');
            return `s${value}`;
          }
          if (value === undefined) return 'u';
          if (value === null || typeof value === 'boolean') return value;
          if (typeof value === 'object') {
            const prototype: unknown = Object.getPrototypeOf(value);
            if (Array.isArray(value) || prototype === Object.prototype || prototype === null)
              return value;
          }
          throw new Error('GPU content identity is unavailable.');
        });
        const bytes = key.length * 2;
        if (bytes > remainingBytes) return undefined;
        remainingBytes -= bytes;
        memo.set(root, key);
        return key;
      } catch {
        memo.set(root, null);
        return undefined;
      }
    };
  };
}
