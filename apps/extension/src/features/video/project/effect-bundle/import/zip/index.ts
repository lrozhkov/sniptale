import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import type { ZipCentralDirectoryEntry } from '@sniptale/platform/data/zip-profile/central-directory';

import { createEffectBundleFailure, type EffectBundleFailure } from '../../diagnostics';
import { parseBoundedEffectJson } from '../../json-structure';
import {
  assertEffectBundleZipLimits,
  isExecutableEntry,
  mapArchiveError,
  readDeclaredEntry,
  readZipEntry,
  validateSafeZipEntryClosure,
  verifyEntryBytes,
  verifyEntryIntegrity,
} from './archive';
import { EFFECT_BUNDLE_LIMITS } from '../../limits';
import {
  parseEffectBundleManifest,
  type EffectBundleAssetManifestEntry,
  type EffectBundleManifest,
} from '../../manifest';
import { materializeDocumentAssets } from '../assets';
import { createEffectDocumentFailure } from '../document-failure';
import type { ImportEffectBundleZipResult, ImportedEffectDocument } from '../types';

export type { ImportedEffectAsset } from '../assets';
export type {
  ImportEffectBundleZipResult,
  ImportedEffectBundle,
  ImportedEffectDocument,
  ImportedRawEffectDocument,
  ImportRawEffectDocumentResult,
} from '../types';
export { importRawEffectDocument } from '../raw';

interface OpenedBundleArchive {
  bytes: Uint8Array;
  entries: Map<string, ZipCentralDirectoryEntry>;
  manifest: EffectBundleManifest;
}

export async function importEffectBundleZip(
  input: ArrayBuffer | Blob | Uint8Array
): Promise<ImportEffectBundleZipResult> {
  const bytes = await readInputBytes(input);
  const opened = await openBundleArchive(bytes);
  if (!opened.ok) return opened;
  const imported = await importArchiveDocuments(opened.archive);
  if (!imported.ok) return imported;
  return {
    bundle: {
      archiveSha256: await sha256EffectV1Bytes(bytes),
      documents: imported.documents,
      manifest: opened.archive.manifest,
    },
    ok: true,
  };
}

async function openBundleArchive(
  bytes: Uint8Array
): Promise<{ archive: OpenedBundleArchive; ok: true } | EffectBundleFailure> {
  let profile;
  try {
    profile = assertEffectBundleZipLimits(bytes);
  } catch (error) {
    return mapArchiveError(error);
  }
  const regularEntries = new Map(
    profile.entries.filter((entry) => !entry.directory).map((entry) => [entry.name, entry])
  );
  const manifestEntry = regularEntries.get('manifest.json');
  if (!manifestEntry) {
    return createEffectBundleFailure('BUNDLE_MANIFEST_MISSING', 'manifest.json');
  }
  if (manifestEntry.uncompressedSize > EFFECT_BUNDLE_LIMITS.maxJsonBytes) {
    return createEffectBundleFailure('BUNDLE_LIMIT_EXCEEDED', 'manifest.json');
  }

  const manifestBytes = await readZipEntry(bytes, manifestEntry);
  if (!manifestBytes.ok) return manifestBytes;
  let manifestInput: unknown;
  try {
    manifestInput = parseBoundedEffectJson(manifestBytes.bytes);
  } catch {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', 'manifest.json');
  }
  const parsedManifest = parseEffectBundleManifest(manifestInput);
  if (!parsedManifest.ok) return parsedManifest;
  const executable = [...regularEntries.keys()].find(isExecutableEntry);
  if (executable) {
    return createEffectBundleFailure('BUNDLE_EXECUTABLE_ENTRY_FORBIDDEN', executable);
  }
  const safePath = validateSafeZipEntryClosure(regularEntries, parsedManifest.manifest);
  if (safePath) return safePath;

  return {
    archive: { bytes, entries: regularEntries, manifest: parsedManifest.manifest },
    ok: true,
  };
}

async function importArchiveDocuments(
  archive: OpenedBundleArchive
): Promise<{ documents: ImportedEffectDocument[]; ok: true } | EffectBundleFailure> {
  const assetBytes = await loadArchiveAssets(archive);
  if (!assetBytes.ok) return assetBytes;
  const documents: ImportedEffectDocument[] = [];
  const usedAssetPaths = new Map<string, EffectBundleAssetManifestEntry>();
  for (const declaration of archive.manifest.effectDocuments) {
    const imported = await importDeclaredDocument(
      archive,
      declaration,
      assetBytes.bytes,
      usedAssetPaths,
      documents.length
    );
    if (!imported.ok) return imported;
    documents.push(imported.document);
  }
  if (usedAssetPaths.size !== archive.manifest.assets.length) {
    return createEffectBundleFailure('BUNDLE_ASSET_CLOSURE', '$.assets');
  }
  return { documents, ok: true };
}

async function loadArchiveAssets(
  archive: OpenedBundleArchive
): Promise<{ bytes: Map<string, Uint8Array>; ok: true } | EffectBundleFailure> {
  const assetBytes = new Map<string, Uint8Array>();
  for (const asset of archive.manifest.assets) {
    const loaded = await readDeclaredEntry(archive.bytes, archive.entries, asset);
    if (!loaded.ok) return loaded;
    const signatureFailure = await verifyEntryBytes(loaded.bytes, asset);
    if (signatureFailure) return signatureFailure;
    assetBytes.set(asset.path, loaded.bytes);
  }
  return { bytes: assetBytes, ok: true };
}

async function importDeclaredDocument(
  archive: OpenedBundleArchive,
  declaration: EffectBundleManifest['effectDocuments'][number],
  assetBytes: ReadonlyMap<string, Uint8Array>,
  usedAssetPaths: Map<string, EffectBundleAssetManifestEntry>,
  index: number
): Promise<{ document: ImportedEffectDocument; ok: true } | EffectBundleFailure> {
  const loaded = await readDeclaredEntry(archive.bytes, archive.entries, declaration);
  if (!loaded.ok) return loaded;
  const integrityFailure = await verifyEntryIntegrity(loaded.bytes, declaration);
  if (integrityFailure) return integrityFailure;
  let inputDocument: unknown;
  let source: string;
  try {
    inputDocument = parseBoundedEffectJson(loaded.bytes);
    source = new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes);
  } catch {
    return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', declaration.path);
  }
  const validation = validateEffectV1Document(inputDocument);
  if (!validation.ok || !validation.document) {
    return createEffectDocumentFailure(declaration.path, validation.diagnostics);
  }
  if (validation.document.id !== declaration.id) {
    return createEffectBundleFailure(
      'BUNDLE_DOCUMENT_ID_MISMATCH',
      `$.effectDocuments[${index}].id`
    );
  }
  const materialized = await materializeDocumentAssets(
    validation.document,
    archive.manifest.assets,
    assetBytes,
    usedAssetPaths
  );
  if (!materialized.ok) return materialized;
  return {
    document: {
      assets: materialized.assets,
      document: validation.document,
      sha256: declaration.sha256,
      source,
    },
    ok: true,
  };
}

async function readInputBytes(input: ArrayBuffer | Blob | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input);
}
