import type {
  EffectBundleCatalogAssetEntry,
  EffectBundleCatalogEntry,
} from '../../../../features/video/project/effect-bundle/catalog';
import { EFFECT_BUNDLE_LIMITS } from '../../../../features/video/project/effect-bundle';

interface PortableEffectBundleAsset {
  byteLength: number;
  kind: EffectBundleCatalogAssetEntry['kind'];
  mimeType: string;
  objectId: string;
  sha256: string;
}

interface PortableEffectBundleMetadata {
  entry: Omit<EffectBundleCatalogEntry, 'assets'> & { assets: PortableEffectBundleAsset[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function encodeEffectBundleMetadata(args: {
  entry: EffectBundleCatalogEntry;
  objectIds: string[];
}): PortableEffectBundleMetadata {
  if (args.objectIds.length !== args.entry.assets.length) {
    throw new Error('Effect bundle portable object inventory is incomplete.');
  }
  const { assets, ...entry } = args.entry;
  return {
    entry: {
      ...entry,
      assets: assets.map(({ blob: _blob, ...asset }, index) => ({
        ...asset,
        objectId: args.objectIds[index]!,
      })),
    },
  };
}

export function parseEffectBundleMetadata(value: unknown): PortableEffectBundleMetadata {
  if (!isRecord(value) || !isRecord(value['entry'])) {
    throw new Error('Effect bundle portable metadata is invalid.');
  }
  const rawEntry = value['entry'];
  if (!Array.isArray(rawEntry['assets'])) {
    throw new Error('Effect bundle portable asset metadata is invalid.');
  }
  if (
    rawEntry['assets'].length === 0 ||
    rawEntry['assets'].length > EFFECT_BUNDLE_LIMITS.maxAssets
  ) {
    throw new Error('Effect bundle portable asset count is invalid.');
  }
  const assets: PortableEffectBundleAsset[] = rawEntry['assets'].map((asset) => {
    if (
      !isRecord(asset) ||
      typeof asset['objectId'] !== 'string' ||
      asset['objectId'].length === 0 ||
      typeof asset['byteLength'] !== 'number' ||
      !Number.isSafeInteger(asset['byteLength']) ||
      typeof asset['mimeType'] !== 'string' ||
      typeof asset['sha256'] !== 'string' ||
      (asset['kind'] !== 'audio' && asset['kind'] !== 'image' && asset['kind'] !== 'svg')
    ) {
      throw new Error('Effect bundle portable asset metadata is invalid.');
    }
    if (
      Number(asset['byteLength']) <= 0 ||
      Number(asset['byteLength']) > EFFECT_BUNDLE_LIMITS.maxEntryBytes
    ) {
      throw new Error('Effect bundle portable asset size is invalid.');
    }
    return {
      byteLength: Number(asset['byteLength']),
      kind: asset['kind'],
      mimeType: asset['mimeType'],
      objectId: asset['objectId'],
      sha256: asset['sha256'],
    };
  });
  if (
    typeof rawEntry['packId'] !== 'string' ||
    rawEntry['packId'].length === 0 ||
    typeof rawEntry['version'] !== 'string' ||
    !Array.isArray(rawEntry['documents']) ||
    rawEntry['documents'].length === 0 ||
    typeof rawEntry['retainedByteLength'] !== 'number' ||
    !Number.isSafeInteger(rawEntry['retainedByteLength'])
  ) {
    throw new Error('Effect bundle portable catalog metadata is invalid.');
  }
  return {
    entry: {
      ...(rawEntry as Omit<EffectBundleCatalogEntry, 'assets'>),
      assets,
    } as PortableEffectBundleMetadata['entry'],
  };
}
