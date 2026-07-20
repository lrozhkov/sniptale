// policyStateIds: [] - manifest key sets are immutable parser allowlists, not authority state.
import { createEffectBundleFailure, type EffectBundleFailure } from '../diagnostics';
import { EFFECT_BUNDLE_LIMITS } from '../limits';
import {
  EFFECT_ASSET_MIME_BY_KIND,
  type EffectBundleAssetKind,
  type EffectBundleAssetManifestEntry,
  type EffectBundleDocumentManifestEntry,
} from './types';
import {
  isCanonicalEffectAssetPath,
  isCanonicalEffectDocumentPath,
  normalizeEffectBundlePathForCollision,
} from '../path';
import { hasExactKeys, isRecord } from '../validation';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DOCUMENT_KEYS = new Set(['byteLength', 'id', 'path', 'schemaVersion', 'sha256']);
const ASSET_KEYS = new Set(['byteLength', 'kind', 'mimeType', 'path', 'sha256']);

export function parseManifestDocuments(
  value: unknown
): { ok: true; value: EffectBundleDocumentManifestEntry[] } | EffectBundleFailure {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > EFFECT_BUNDLE_LIMITS.maxDocuments
  ) {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$.effectDocuments');
  }
  const result: EffectBundleDocumentManifestEntry[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    const path = `$.effectDocuments[${index}]`;
    if (!isRecord(entry) || !hasExactKeys(entry, DOCUMENT_KEYS)) {
      return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', path);
    }
    if (!isCanonicalEffectDocumentPath(entry['path'])) {
      return createEffectBundleFailure('BUNDLE_ENTRY_PATH_UNSAFE', `${path}.path`);
    }
    if (
      !isIdentifier(entry['id']) ||
      ids.has(entry['id']) ||
      entry['schemaVersion'] !== 'sniptale.effect.v1' ||
      !isBoundedInteger(entry['byteLength'], EFFECT_BUNDLE_LIMITS.maxJsonBytes) ||
      !isSha256(entry['sha256'])
    ) {
      return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', path);
    }
    ids.add(entry['id']);
    result.push({
      byteLength: entry['byteLength'],
      id: entry['id'],
      path: entry['path'],
      schemaVersion: 'sniptale.effect.v1',
      sha256: entry['sha256'],
    });
  }
  return { ok: true, value: result };
}

export function parseManifestAssets(
  value: unknown
): { ok: true; value: EffectBundleAssetManifestEntry[] } | EffectBundleFailure {
  if (!Array.isArray(value) || value.length > EFFECT_BUNDLE_LIMITS.maxAssets) {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$.assets');
  }
  const result: EffectBundleAssetManifestEntry[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    const path = `$.assets[${index}]`;
    if (!isRecord(entry) || !hasExactKeys(entry, ASSET_KEYS)) {
      return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', path);
    }
    if (!isCanonicalEffectAssetPath(entry['path'])) {
      return createEffectBundleFailure('BUNDLE_ENTRY_PATH_UNSAFE', `${path}.path`);
    }
    if (
      !isAssetKind(entry['kind']) ||
      typeof entry['mimeType'] !== 'string' ||
      !EFFECT_ASSET_MIME_BY_KIND[entry['kind']].has(entry['mimeType']) ||
      !isBoundedInteger(entry['byteLength'], EFFECT_BUNDLE_LIMITS.maxEntryBytes) ||
      !isSha256(entry['sha256'])
    ) {
      return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', path);
    }
    result.push({
      byteLength: entry['byteLength'],
      kind: entry['kind'],
      mimeType: entry['mimeType'],
      path: entry['path'],
      sha256: entry['sha256'],
    });
  }
  return { ok: true, value: result };
}

export function findManifestCollision(
  documents: readonly EffectBundleDocumentManifestEntry[],
  assets: readonly EffectBundleAssetManifestEntry[]
): string | null {
  const paths = new Set<string>();
  for (const path of [
    'manifest.json',
    ...documents.map((entry) => entry.path),
    ...assets.map((entry) => entry.path),
  ]) {
    const normalized = normalizeEffectBundlePathForCollision(path);
    if (paths.has(normalized)) return path;
    paths.add(normalized);
  }
  return null;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isBoundedInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maximum;
}

function isAssetKind(value: unknown): value is EffectBundleAssetKind {
  return value === 'audio' || value === 'image' || value === 'svg';
}
