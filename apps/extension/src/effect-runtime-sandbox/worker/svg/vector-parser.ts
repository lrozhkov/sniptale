// policyStateIds: [] - the worker-local decoded vector cache owns no authorization state.
import {
  parseSerializedSvgVector,
  type SerializedSvgVector,
  type SerializedSvgVectorPart,
} from './vector-payload.js';

interface EffectSvgVectorAsset {
  cacheKey?: string;
  id: string;
  svgVector: unknown;
}

const svgVectorCache = new Map<string, HydratedSvgVector>();

export type HydratedSvgVector = Omit<SerializedSvgVector, 'parts'> & {
  parts: Array<SerializedSvgVectorPart & { path?: Path2D }>;
};

export function parseSvgAsset(asset: EffectSvgVectorAsset): HydratedSvgVector {
  const key = `${asset.id}:${asset.cacheKey ?? ''}`;
  const cached = svgVectorCache.get(key);
  if (cached) return cached;
  const serialized = parseSerializedSvgVector(asset.svgVector);
  if (!serialized) throw new Error('EFFECT_SVG_PAYLOAD_INVALID');
  const hydrated: HydratedSvgVector = {
    ...serialized,
    parts: serialized.parts.map((part) =>
      part.type === 'path' ? { ...part, path: new Path2D(part.pathData) } : part
    ),
  };
  svgVectorCache.set(key, hydrated);
  return hydrated;
}

export function clearSvgVectorCache(): void {
  svgVectorCache.clear();
}
