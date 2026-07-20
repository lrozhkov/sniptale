import {
  assertEffectV1AssetSignature,
  sha256EffectV1Bytes,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { hasExactKeys, isRecord } from '../../contracts/effect-runtime/identity';
import type { EffectRuntimeVisualAssetPayload } from '../../contracts/effect-runtime/types';
import { EFFECT_BUNDLE_LIMITS } from '../../features/video/project/effect-bundle/limits';

const ASSET_KEYS = ['byteLength', 'bytes', 'id', 'kind', 'mimeType', 'sha256'] as const;

export async function parseVisualAssets(
  value: unknown,
  document: EffectV1Document
): Promise<EffectRuntimeVisualAssetPayload[] | null> {
  if (!Array.isArray(value)) return null;
  const expected = document.assets.filter(
    (asset): asset is typeof asset & { kind: 'image' | 'svg'; sha256: string } =>
      asset.kind !== 'audio' && typeof asset.sha256 === 'string'
  );
  if (value.length !== expected.length) return null;
  const byId = new Map(expected.map((asset) => [asset.id, asset]));
  const parsed: EffectRuntimeVisualAssetPayload[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const candidate of value) {
    const asset = await parseVisualAsset(candidate, byId, seen);
    if (!asset) return null;
    totalBytes += asset.byteLength;
    if (totalBytes > EFFECT_BUNDLE_LIMITS.maxInflatedBytes) return null;
    parsed.push(asset);
  }
  return parsed;
}

async function parseVisualAsset(
  candidate: unknown,
  expected: Map<string, EffectV1Document['assets'][number]>,
  seen: Set<string>
): Promise<EffectRuntimeVisualAssetPayload | null> {
  if (!isRecord(candidate) || !hasExactKeys(candidate, ASSET_KEYS)) return null;
  const declared = typeof candidate['id'] === 'string' ? expected.get(candidate['id']) : undefined;
  const buffer = candidate['bytes'];
  if (!(buffer instanceof ArrayBuffer) || !isMatchingAsset(candidate, declared, seen, buffer)) {
    return null;
  }
  const bytes = new Uint8Array(buffer);
  if ((await sha256EffectV1Bytes(bytes)) !== declared.sha256) return null;
  try {
    assertEffectV1AssetSignature(bytes, declared.mimeType, declared.id);
  } catch {
    return null;
  }
  seen.add(declared.id);
  return {
    byteLength: bytes.byteLength,
    bytes: buffer,
    id: declared.id,
    kind: declared.kind,
    mimeType: declared.mimeType,
    sha256: declared.sha256,
  };
}

function isMatchingAsset(
  candidate: Record<string, unknown>,
  declared: EffectV1Document['assets'][number] | undefined,
  seen: Set<string>,
  buffer: ArrayBuffer
): declared is EffectV1Document['assets'][number] & {
  kind: 'image' | 'svg';
  sha256: string;
} {
  return Boolean(
    declared &&
    declared.kind !== 'audio' &&
    typeof declared.sha256 === 'string' &&
    !seen.has(declared.id) &&
    candidate['kind'] === declared.kind &&
    candidate['mimeType'] === declared.mimeType &&
    candidate['sha256'] === declared.sha256 &&
    candidate['byteLength'] === declared.byteLength &&
    buffer.byteLength === declared.byteLength &&
    buffer.byteLength <= EFFECT_BUNDLE_LIMITS.maxEntryBytes
  );
}
