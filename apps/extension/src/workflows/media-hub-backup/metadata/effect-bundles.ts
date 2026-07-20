import type { EffectBundleCatalogDocumentEntry } from '../../../features/video/project/effect-bundle/catalog';
import type {
  EffectBundleBackupAssetDescriptor,
  EffectBundleBackupDescriptor,
} from '../contracts/types';
import { readSafeBackupPathSegment } from './archive-fields';
import {
  failMetadata,
  field,
  type JsonRecord,
  readBoolean,
  readNumber,
  readPath,
  readRecord,
  readRecordArray,
  readString,
} from './readers';

const SHA256 = /^[a-f0-9]{64}$/u;

export function normalizeEffectBundleDescriptor(value: JsonRecord): EffectBundleBackupDescriptor {
  const entry = readRecord(field(value, 'entry'));
  if ('assets' in entry || 'blob' in entry) failMetadata();
  const packId = readSafeBackupPathSegment(field(entry, 'packId'), 'effect bundle id');
  const assets = readRecordArray(field(value, 'assets')).map((asset) =>
    normalizeEffectBundleAssetDescriptor(asset, packId)
  );
  const blobPaths = assets.map(({ blobPath }) => blobPath);
  if (new Set(blobPaths).size !== blobPaths.length) failMetadata();
  const source = readString(field(entry, 'source'));
  if (source !== 'bundle-zip' && source !== 'raw-json') failMetadata();
  const sourceSha256 = readSha256(field(entry, 'sourceSha256'));
  return {
    assets,
    entry: {
      createdAt: readNumber(field(entry, 'createdAt')),
      description: readLocalizedText(field(entry, 'description')),
      documents: readRecordArray(field(entry, 'documents')).map(normalizeCatalogDocument),
      enabled: readBoolean(field(entry, 'enabled')),
      label: readLocalizedText(field(entry, 'label')),
      packId,
      retainedByteLength: readNumber(field(entry, 'retainedByteLength')),
      source,
      sourceSha256,
      updatedAt: readNumber(field(entry, 'updatedAt')),
      version: readString(field(entry, 'version')),
    },
  };
}

function normalizeEffectBundleAssetDescriptor(
  value: JsonRecord,
  packId: string
): EffectBundleBackupAssetDescriptor {
  const entry = readRecord(field(value, 'entry'));
  if ('blob' in entry) failMetadata();
  const kind = readString(field(entry, 'kind'));
  if (kind !== 'audio' && kind !== 'image' && kind !== 'svg') failMetadata();
  return {
    blobPath: readPath(field(value, 'blobPath'), [`effect-bundles/${packId}/assets/`]),
    entry: {
      byteLength: readNumber(field(entry, 'byteLength')),
      kind,
      mimeType: readString(field(entry, 'mimeType')),
      sha256: readSha256(field(entry, 'sha256')),
    },
  };
}

function normalizeCatalogDocument(value: JsonRecord): EffectBundleCatalogDocumentEntry {
  const kind = readEffectKind(field(value, 'kind'));
  const schemaVersion = readString(field(value, 'schemaVersion'));
  if (schemaVersion !== 'sniptale.effect.v1') failMetadata();
  return {
    assets: readRecordArray(field(value, 'assets')).map((asset) => ({
      id: readSafeBackupPathSegment(field(asset, 'id'), 'effect asset id'),
      sha256: readSha256(field(asset, 'sha256')),
    })),
    id: readSafeBackupPathSegment(field(value, 'id'), 'effect document id'),
    kind,
    schemaVersion,
    sha256: readSha256(field(value, 'sha256')),
    source: readString(field(value, 'source')),
  };
}

function readEffectKind(value: unknown): EffectBundleCatalogDocumentEntry['kind'] {
  const kind = readString(value);
  if (kind === 'standalone' || kind === 'targetEffect' || kind === 'transition') return kind;
  return failMetadata();
}

function readLocalizedText(value: unknown): { en: string; ru: string } {
  const record = readRecord(value);
  return { en: readString(field(record, 'en')), ru: readString(field(record, 'ru')) };
}

function readSha256(value: unknown): string {
  const sha256 = readString(value);
  return SHA256.test(sha256) ? sha256 : failMetadata();
}
