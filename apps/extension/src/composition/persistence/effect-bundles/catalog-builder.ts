import type {
  EffectBundleCatalogDocumentEntry,
  EffectBundleCatalogEntry,
} from '../../../features/video/project/effect-bundle/catalog';
import type { ImportedEffectArtifact } from '../../../features/video/project/effect-bundle/import/artifact';
import type {
  ImportedEffectAsset,
  ImportedEffectDocument,
} from '../../../features/video/project/effect-bundle/import/types';
import { EffectBundlePersistenceError } from './errors';

export async function createEffectCatalogEntry(
  artifact: ImportedEffectArtifact,
  now: number
): Promise<EffectBundleCatalogEntry> {
  const documents =
    artifact.kind === 'bundle-zip' ? artifact.bundle.documents : [artifact.document.document];
  const assetMap = collectUniqueAssets(documents);
  const retainedByteLength =
    documents.reduce(
      (total, document) => total + new TextEncoder().encode(document.source).byteLength,
      0
    ) + [...assetMap.values()].reduce((total, asset) => total + asset.byteLength, 0);
  const label = toRequiredLocale(
    artifact.kind === 'bundle-zip' ? artifact.bundle.manifest.label : documents[0]!.document.label
  );
  const description = toRequiredLocale(
    (artifact.kind === 'bundle-zip'
      ? artifact.bundle.manifest.description
      : documents[0]!.document.description) ?? { en: '', ru: '' }
  );
  return {
    assets: [...assetMap.values()].map((asset) => ({
      blob: new Blob([asset.bytes.slice().buffer], { type: asset.mimeType }),
      byteLength: asset.byteLength,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
    })),
    createdAt: now,
    description,
    documents: documents.map(toDocumentEntry),
    enabled: true,
    label,
    packId:
      artifact.kind === 'bundle-zip'
        ? artifact.bundle.manifest.packId
        : `raw.${documents[0]!.document.id}`,
    retainedByteLength,
    source: artifact.kind,
    sourceSha256:
      artifact.kind === 'bundle-zip'
        ? artifact.bundle.archiveSha256
        : artifact.document.sourceSha256,
    updatedAt: now,
    version: artifact.kind === 'bundle-zip' ? artifact.bundle.manifest.version : '0.0.0',
  };
}

function collectUniqueAssets(
  documents: readonly ImportedEffectDocument[]
): Map<string, ImportedEffectAsset> {
  const assets = new Map<string, ImportedEffectAsset>();
  for (const document of documents) {
    for (const asset of document.assets) {
      const existing = assets.get(asset.sha256);
      if (existing && !equalBytes(existing.bytes, asset.bytes)) {
        throw new EffectBundlePersistenceError('catalogIntegrityFailure');
      }
      assets.set(asset.sha256, existing ?? asset);
    }
  }
  return assets;
}

function toDocumentEntry(document: ImportedEffectDocument): EffectBundleCatalogDocumentEntry {
  return {
    assets: document.assets.map(({ id, sha256 }) => ({ id, sha256 })),
    id: document.document.id,
    kind: document.document.kind,
    schemaVersion: 'sniptale.effect.v1',
    sha256: document.sha256,
    source: document.source,
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

function toRequiredLocale(value: { en?: string; ru?: string }): { en: string; ru: string } {
  return { en: value.en ?? value.ru ?? '', ru: value.ru ?? value.en ?? '' };
}
