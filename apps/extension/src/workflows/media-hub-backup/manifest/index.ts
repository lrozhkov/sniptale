import JSZip from 'jszip';

import { translate } from '../../../platform/i18n';
import {
  assertZipEntryCanInflate,
  assertZipPackageInflationProfile,
} from '@sniptale/platform/data/zip-profile';
import type { MediaHubBackupManifest, MediaHubBackupMetadata } from '../contracts/types';
import { parseBackupMetadata } from '../metadata';
import { parseBackupManifestPrivacyFields } from './privacy-options';
import { readManifestNumber, readManifestRecord, readManifestString } from './readers';

export const BACKUP_FORMAT = 'sniptale-media-hub-backup';
export const BACKUP_VERSION = 4;
export const MAX_BACKUP_ARCHIVE_BYTES = 500 * 1024 * 1024;
export const MAX_BACKUP_FILE_COUNT = 2000;
export const MAX_BACKUP_JSON_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_ENTRY_BYTES = 250 * 1024 * 1024;
export const MAX_BACKUP_TOTAL_INFLATED_BYTES = 2 * 1024 * 1024 * 1024;

export interface MediaHubBackupParts {
  inflatedSizeBytes: number;
  manifest: MediaHubBackupManifest;
  metadata: MediaHubBackupMetadata;
  zip: JSZip;
}

function decodeJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `${translate('shared.mediaHub.backupReadFailedPrefix')} ${label} ` +
        translate('shared.mediaHub.backupReadFailedSuffix')
    );
  }
}

function assertSafeBackupPath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
  }
}

function parseBackupManifest(value: unknown): MediaHubBackupManifest {
  const manifest = readManifestRecord(value);
  const parsed: MediaHubBackupManifest = {
    assetCount: readManifestNumber(manifest['assetCount']),
    effectBundleCount: readManifestNumber(manifest['effectBundleCount']),
    exportedAt: readManifestString(manifest['exportedAt']),
    format: readManifestString(manifest['format']),
    thumbnailCount: readManifestNumber(manifest['thumbnailCount']),
    version: readManifestNumber(manifest['version']),
  };

  if (manifest['scenarioProjectCount'] !== undefined) {
    parsed.scenarioProjectCount = readManifestNumber(manifest['scenarioProjectCount']);
  }
  if (manifest['videoProjectCount'] !== undefined) {
    parsed.videoProjectCount = readManifestNumber(manifest['videoProjectCount']);
  }
  const { dataClasses, privacyOptions } = parseBackupManifestPrivacyFields(manifest);
  if (dataClasses) {
    parsed.dataClasses = dataClasses;
  }
  if (privacyOptions) {
    parsed.privacyOptions = privacyOptions;
  }

  return parsed;
}

async function readZipTextWithLimit(
  file: JSZip.JSZipObject,
  maxBytes: number,
  label: string
): Promise<string> {
  assertZipEntryCanInflate(
    file,
    maxBytes,
    () => new Error(`${translate('shared.mediaHub.backupReadFailedPrefix')} ${label}.`)
  );
  const value = await file.async('uint8array');
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof Blob
        ? new Uint8Array(await value.arrayBuffer())
        : value;
  if (bytes.byteLength > maxBytes) {
    throw new Error(`${translate('shared.mediaHub.backupReadFailedPrefix')} ${label}.`);
  }

  return new TextDecoder().decode(bytes);
}

function assertBackupZipLimits(zip: JSZip): number {
  return assertZipPackageInflationProfile(Object.values(zip.files), {
    assertPath: assertSafeBackupPath,
    createEntryError: () => new Error(translate('shared.mediaHub.backupInvalidArchive')),
    createFileCountError: () => new Error(translate('shared.mediaHub.backupInvalidArchive')),
    createTotalError: () => new Error(translate('shared.mediaHub.backupInvalidArchive')),
    maxFileCount: MAX_BACKUP_FILE_COUNT,
    maxTotalBytes: MAX_BACKUP_TOTAL_INFLATED_BYTES,
    resolveEntryMaxBytes: () => MAX_BACKUP_ENTRY_BYTES,
  });
}

function assertBackupManifest(manifest: MediaHubBackupManifest): void {
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
  }

  if (manifest.version !== BACKUP_VERSION) {
    throw new Error(
      `${translate('shared.mediaHub.backupUnsupportedVersionPrefix')} ${manifest.version}.`
    );
  }
}

export async function loadBackupParts(file: Blob): Promise<MediaHubBackupParts> {
  if (file.size > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
  }

  const zip = await JSZip.loadAsync(file);
  const inflatedSizeBytes = assertBackupZipLimits(zip);
  const manifestFile = zip.file('manifest.json');
  const metadataFile = zip.file('metadata.json');

  if (!manifestFile || !metadataFile) {
    throw new Error(translate('shared.mediaHub.backupMissingManifestOrMetadata'));
  }

  const manifest = parseBackupManifest(
    decodeJson(
      await readZipTextWithLimit(manifestFile, MAX_BACKUP_JSON_BYTES, 'manifest.json'),
      'manifest.json'
    )
  );
  const metadata = parseBackupMetadata(
    decodeJson(
      await readZipTextWithLimit(metadataFile, MAX_BACKUP_JSON_BYTES, 'metadata.json'),
      'metadata.json'
    )
  );

  assertBackupManifest(manifest);
  if (manifest.effectBundleCount !== metadata.effectBundles.length) {
    throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
  }

  return { inflatedSizeBytes, manifest, metadata, zip };
}
