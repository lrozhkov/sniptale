import {
  assertEffectV1AssetSignature,
  decodeEffectV1EmbeddedAsset,
  sha256EffectV1Bytes,
  type EffectV1Asset,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { createEffectBundleFailure, type EffectBundleFailure } from '../diagnostics';
import type { EffectBundleAssetManifestEntry } from '../manifest';

export interface ImportedEffectAsset {
  bytes: Uint8Array;
  byteLength: number;
  id: string;
  kind: EffectV1Asset['kind'];
  mimeType: string;
  path?: string;
  sha256: string;
}

export async function materializeDocumentAssets(
  document: EffectV1Document,
  manifestAssets: readonly EffectBundleAssetManifestEntry[],
  bytesByPath: ReadonlyMap<string, Uint8Array>,
  usedPaths: Map<string, EffectBundleAssetManifestEntry>
): Promise<{ assets: ImportedEffectAsset[]; ok: true } | EffectBundleFailure> {
  const declarations = new Map(manifestAssets.map((asset) => [asset.path, asset]));
  const assets: ImportedEffectAsset[] = [];
  for (let index = 0; index < document.assets.length; index += 1) {
    const materialized = await materializeAsset(
      document.assets[index]!,
      index,
      declarations,
      bytesByPath,
      usedPaths
    );
    if (!materialized.ok) return materialized;
    assets.push(materialized.asset);
  }
  return { assets, ok: true };
}

async function materializeAsset(
  asset: EffectV1Asset,
  index: number,
  declarations: ReadonlyMap<string, EffectBundleAssetManifestEntry>,
  bytesByPath: ReadonlyMap<string, Uint8Array>,
  usedPaths: Map<string, EffectBundleAssetManifestEntry>
): Promise<{ asset: ImportedEffectAsset; ok: true } | EffectBundleFailure> {
  let bytes: Uint8Array;
  let path: string | undefined;
  if (asset.path) {
    const declaration = declarations.get(asset.path);
    const stored = bytesByPath.get(asset.path);
    if (!declaration || !stored || !assetMatchesManifest(asset, declaration)) {
      return createEffectBundleFailure('BUNDLE_ASSET_CLOSURE', `$.assets[${index}]`);
    }
    bytes = stored;
    path = asset.path;
    usedPaths.set(asset.path, declaration);
  } else {
    try {
      bytes = decodeEffectV1EmbeddedAsset(asset);
    } catch {
      return createEffectBundleFailure('BUNDLE_ASSET_CLOSURE', `$.assets[${index}]`);
    }
    const failure = await verifyEmbeddedAsset(bytes, asset, index);
    if (failure) return failure;
  }
  return {
    asset: {
      bytes,
      byteLength: bytes.byteLength,
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      ...(path ? { path } : {}),
      sha256: asset.sha256!,
    },
    ok: true,
  };
}

function assetMatchesManifest(
  asset: EffectV1Asset,
  manifest: EffectBundleAssetManifestEntry
): boolean {
  return (
    asset.kind === manifest.kind &&
    asset.mimeType === manifest.mimeType &&
    asset.byteLength === manifest.byteLength &&
    asset.sha256 === manifest.sha256
  );
}

async function verifyEmbeddedAsset(
  bytes: Uint8Array,
  asset: EffectV1Asset,
  index: number
): Promise<EffectBundleFailure | null> {
  if (
    asset.byteLength !== bytes.byteLength ||
    !asset.sha256 ||
    (await sha256EffectV1Bytes(bytes)) !== asset.sha256
  ) {
    return createEffectBundleFailure('BUNDLE_ASSET_CLOSURE', `$.assets[${index}]`);
  }
  try {
    assertEffectV1AssetSignature(bytes, asset.mimeType, asset.id);
  } catch {
    return createEffectBundleFailure('BUNDLE_ASSET_MIME_MISMATCH', `$.assets[${index}]`);
  }
  return null;
}
