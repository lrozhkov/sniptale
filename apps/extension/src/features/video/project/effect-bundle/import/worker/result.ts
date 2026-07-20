import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import type { ImportEffectArtifactResult } from '../artifact';
import type {
  ImportedEffectAsset,
  ImportedEffectDocument,
  ImportedRawEffectDocument,
} from '../zip';
import { EFFECT_BUNDLE_LIMITS } from '../../limits';
import { parseEffectBundleManifest } from '../../manifest';
import { hasExactKeys, isBoundedString, isRecord } from '../../validation';
import { parseImportFailure } from './diagnostics';

const SHA256 = /^[a-f0-9]{64}$/u;

export function parseEffectImportResult(value: unknown): ImportEffectArtifactResult | null {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return null;
  if (!value['ok']) return parseImportFailure(value);
  if (!hasExactKeys(value, ['artifact', 'ok']) || !isRecord(value['artifact'])) return null;
  const artifact = value['artifact'];
  if (artifact['kind'] === 'bundle-zip') return parseBundleArtifact(artifact);
  if (artifact['kind'] === 'raw-json') return parseRawArtifact(artifact);
  return null;
}

function parseBundleArtifact(artifact: Record<string, unknown>): ImportEffectArtifactResult | null {
  if (!hasExactKeys(artifact, ['bundle', 'kind']) || !isRecord(artifact['bundle'])) return null;
  const bundle = artifact['bundle'];
  if (!hasExactKeys(bundle, ['archiveSha256', 'documents', 'manifest'])) return null;
  const manifest = parseEffectBundleManifest(bundle['manifest']);
  const documents = parseDocuments(bundle['documents']);
  if (
    !isSha256(bundle['archiveSha256']) ||
    !manifest.ok ||
    !documents ||
    documents.length !== manifest.manifest.effectDocuments.length
  ) {
    return null;
  }
  return {
    artifact: {
      bundle: { archiveSha256: bundle['archiveSha256'], documents, manifest: manifest.manifest },
      kind: 'bundle-zip',
    },
    ok: true,
  };
}

function parseRawArtifact(artifact: Record<string, unknown>): ImportEffectArtifactResult | null {
  if (!hasExactKeys(artifact, ['document', 'kind']) || !isRecord(artifact['document'])) {
    return null;
  }
  const raw = artifact['document'];
  if (!hasExactKeys(raw, ['document', 'sourceSha256']) || !isSha256(raw['sourceSha256'])) {
    return null;
  }
  const document = parseImportedDocument(raw['document']);
  if (!document) return null;
  const imported: ImportedRawEffectDocument = {
    document,
    sourceSha256: raw['sourceSha256'],
  };
  return { artifact: { document: imported, kind: 'raw-json' }, ok: true };
}

function parseDocuments(value: unknown): ImportedEffectDocument[] | null {
  if (!Array.isArray(value) || value.length > EFFECT_BUNDLE_LIMITS.maxDocuments) return null;
  const documents: ImportedEffectDocument[] = [];
  for (const candidate of value) {
    const document = parseImportedDocument(candidate);
    if (!document) return null;
    documents.push(document);
  }
  return documents;
}

function parseImportedDocument(value: unknown): ImportedEffectDocument | null {
  if (!isRecord(value) || !hasExactKeys(value, ['assets', 'document', 'sha256', 'source'])) {
    return null;
  }
  if (
    !isSha256(value['sha256']) ||
    typeof value['source'] !== 'string' ||
    value['source'].length > EFFECT_BUNDLE_LIMITS.maxJsonBytes
  ) {
    return null;
  }
  const validation = validateEffectV1Document(value['document']);
  const assets = parseAssets(value['assets']);
  if (!validation.ok || !validation.document || !assets) return null;
  return {
    assets,
    document: validation.document,
    sha256: value['sha256'],
    source: value['source'],
  };
}

function parseAssets(value: unknown): ImportedEffectAsset[] | null {
  if (!Array.isArray(value) || value.length > EFFECT_BUNDLE_LIMITS.maxAssets) return null;
  const assets: ImportedEffectAsset[] = [];
  for (const candidate of value) {
    const asset = parseAsset(candidate);
    if (!asset) return null;
    assets.push(asset);
  }
  return assets;
}

function parseAsset(value: unknown): ImportedEffectAsset | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['byteLength', 'bytes', 'id', 'kind', 'mimeType', 'path', 'sha256'],
      ['path']
    )
  ) {
    return null;
  }
  const bytes = value['bytes'];
  const path = value['path'];
  if (
    !(bytes instanceof Uint8Array) ||
    !Number.isSafeInteger(value['byteLength']) ||
    value['byteLength'] !== bytes.byteLength ||
    bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxEntryBytes ||
    !isBoundedString(value['id'], 128) ||
    !isAssetKind(value['kind']) ||
    !isBoundedString(value['mimeType'], 128) ||
    !isSha256(value['sha256']) ||
    (path !== undefined && !isSafeRelativePath(path))
  ) {
    return null;
  }
  return {
    bytes,
    byteLength: bytes.byteLength,
    id: value['id'],
    kind: value['kind'],
    mimeType: value['mimeType'],
    ...(path === undefined ? {} : { path }),
    sha256: value['sha256'],
  };
}

function isAssetKind(value: unknown): value is ImportedEffectAsset['kind'] {
  return value === 'audio' || value === 'image' || value === 'svg';
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 512 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').includes('..')
  );
}
