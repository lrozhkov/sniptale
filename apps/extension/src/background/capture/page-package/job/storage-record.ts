import {
  MAX_PAGE_COLLECTION_PAGES,
  MAX_PAGE_PACKAGE_TOTAL_BYTES,
  PAGE_COLLECTION_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
} from '@sniptale/runtime-contracts/page-package';
import type { AssetRef } from '../../../../composition/persistence/assets';
import { parsePagePackageJobStatusV1, type PagePackageJobStatusV1 } from './status';
import type { AppLocale } from '../../../../platform/i18n';

const MAX_IDENTIFIER_LENGTH = 512;
const MAX_FILENAME_LENGTH = 4096;
const MAX_STAGED_PAGES = 256;
const MAX_PERSISTED_JOB_ASSET_BYTES =
  MAX_PAGE_PACKAGE_TOTAL_BYTES * MAX_PAGE_COLLECTION_PAGES + 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type PagePackageOutputPhase =
  | 'prepared'
  | 'leased'
  | 'starting-download'
  | 'downloading'
  | 'ambiguous-download'
  | 'cleanup-failed';

export interface PersistedStagedPage {
  assetJournalId: string;
  assetRef: AssetRef;
  cleanupError: string | null;
  jobId: string;
  ordinal: number;
  phase: 'ready' | 'reading' | 'retained-output' | 'cleanup-failed';
  stagedBlobId: string;
  tabId: number;
}

export interface PersistedPagePackageOutput {
  assetJournalId: string;
  assetRef: AssetRef;
  cleanupError: string | null;
  downloadId: number | null;
  downloadOperationId: string;
  downloadRequestedAt: number | null;
  filename: string;
  kind: 'page-collection' | 'page-package';
  leaseUrl: string | null;
  phase: PagePackageOutputPhase;
  urlLeaseId: string | null;
}

export interface PagePackageJobRecordV1 {
  jobId: string;
  libraryCleanupAssetIds: string[];
  locale: AppLocale | null;
  output: PersistedPagePackageOutput | null;
  schemaVersion: 1;
  stagedPages: PersistedStagedPage[];
  status: PagePackageJobStatusV1;
  updatedAt: number;
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isNullableIdentifier(value: unknown): value is string | null {
  return value === null || isIdentifier(value);
}

export function boundPagePackageCleanupError(value: string): string {
  return value.slice(0, MAX_IDENTIFIER_LENGTH) || 'Page Package cleanup failed.';
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parsePersistedAssetRef(value: unknown): AssetRef | null {
  if (
    !isExactRecord(value, ['assetId', 'createdAt', 'location', 'mimeType', 'sha256', 'size']) ||
    !isExactRecord(value['location'], ['kind', 'objectKey']) ||
    !isIdentifier(value['assetId']) ||
    !isNonNegativeInteger(value['createdAt']) ||
    value['location']['kind'] !== 'opfs' ||
    value['location']['objectKey'] !== `objects/${value['assetId']}` ||
    (value['mimeType'] !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE &&
      value['mimeType'] !== PAGE_COLLECTION_ARCHIVE_MIME_TYPE) ||
    (value['sha256'] !== null &&
      (typeof value['sha256'] !== 'string' || !SHA256_PATTERN.test(value['sha256']))) ||
    !Number.isSafeInteger(value['size']) ||
    (value['size'] as number) <= 0 ||
    (value['size'] as number) > MAX_PERSISTED_JOB_ASSET_BYTES
  ) {
    return null;
  }
  return {
    assetId: value['assetId'],
    createdAt: value['createdAt'],
    location: { kind: 'opfs', objectKey: value['location']['objectKey'] as string },
    mimeType: value['mimeType'],
    sha256: value['sha256'],
    size: value['size'] as number,
  };
}

function parseStagedPage(value: unknown): PersistedStagedPage | null {
  if (
    !isExactRecord(value, [
      'assetJournalId',
      'assetRef',
      'cleanupError',
      'jobId',
      'ordinal',
      'phase',
      'stagedBlobId',
      'tabId',
    ])
  )
    return null;
  const assetRef = parsePersistedAssetRef(value['assetRef']);
  const phase = value['phase'];
  return assetRef &&
    isIdentifier(value['assetJournalId']) &&
    (value['cleanupError'] === null || isIdentifier(value['cleanupError'])) &&
    isIdentifier(value['jobId']) &&
    isNonNegativeInteger(value['ordinal']) &&
    (phase === 'ready' ||
      phase === 'reading' ||
      phase === 'retained-output' ||
      phase === 'cleanup-failed') &&
    isIdentifier(value['stagedBlobId']) &&
    isNonNegativeInteger(value['tabId'])
    ? {
        assetJournalId: value['assetJournalId'],
        assetRef,
        cleanupError: value['cleanupError'],
        jobId: value['jobId'],
        ordinal: value['ordinal'],
        phase,
        stagedBlobId: value['stagedBlobId'],
        tabId: value['tabId'],
      }
    : null;
}

function parseOutput(value: unknown): PersistedPagePackageOutput | null {
  if (
    !isExactRecord(value, [
      'assetJournalId',
      'assetRef',
      'cleanupError',
      'downloadId',
      'downloadOperationId',
      'downloadRequestedAt',
      'filename',
      'kind',
      'leaseUrl',
      'phase',
      'urlLeaseId',
    ])
  )
    return null;
  const assetRef = parsePersistedAssetRef(value['assetRef']);
  const phase = value['phase'];
  const parsed: PersistedPagePackageOutput | null =
    assetRef &&
    isIdentifier(value['assetJournalId']) &&
    (value['cleanupError'] === null || isIdentifier(value['cleanupError'])) &&
    (value['downloadId'] === null || isNonNegativeInteger(value['downloadId'])) &&
    isIdentifier(value['downloadOperationId']) &&
    (value['downloadRequestedAt'] === null || isNonNegativeInteger(value['downloadRequestedAt'])) &&
    typeof value['filename'] === 'string' &&
    value['filename'].length > 0 &&
    value['filename'].length <= MAX_FILENAME_LENGTH &&
    (value['kind'] === 'page-package' || value['kind'] === 'page-collection') &&
    (value['leaseUrl'] === null || isIdentifier(value['leaseUrl'])) &&
    (phase === 'prepared' ||
      phase === 'leased' ||
      phase === 'starting-download' ||
      phase === 'downloading' ||
      phase === 'ambiguous-download' ||
      phase === 'cleanup-failed') &&
    isNullableIdentifier(value['urlLeaseId'])
      ? {
          assetJournalId: value['assetJournalId'],
          assetRef,
          cleanupError: value['cleanupError'],
          downloadId: value['downloadId'],
          downloadOperationId: value['downloadOperationId'],
          downloadRequestedAt: value['downloadRequestedAt'],
          filename: value['filename'],
          kind: value['kind'],
          leaseUrl: value['leaseUrl'],
          phase,
          urlLeaseId: value['urlLeaseId'],
        }
      : null;
  if (!parsed) return null;
  const hasLease = parsed.urlLeaseId !== null && parsed.leaseUrl !== null;
  const hasRequest = parsed.downloadRequestedAt !== null;
  const hasDownload = parsed.downloadId !== null;
  const phaseIdentityValid =
    (parsed.phase === 'prepared' && !hasLease && !hasRequest && !hasDownload) ||
    (parsed.phase === 'leased' && hasLease && !hasRequest && !hasDownload) ||
    (parsed.phase === 'starting-download' && hasLease && hasRequest && !hasDownload) ||
    (parsed.phase === 'downloading' && hasLease && hasRequest && hasDownload) ||
    (parsed.phase === 'ambiguous-download' && hasLease && hasRequest) ||
    (parsed.phase === 'cleanup-failed' &&
      ((hasLease && (!hasDownload || hasRequest)) || (!hasLease && !hasRequest && !hasDownload)));
  return phaseIdentityValid ? parsed : null;
}

export function parsePagePackageJobRecordV1(value: unknown): PagePackageJobRecordV1 | null {
  const recordKeys = [
    'jobId',
    'libraryCleanupAssetIds',
    'locale',
    'output',
    'schemaVersion',
    'stagedPages',
    'status',
    'updatedAt',
  ];
  const legacyRecordKeys = recordKeys.filter((key) => key !== 'locale');
  if (!isExactRecord(value, recordKeys) && !isExactRecord(value, legacyRecordKeys)) return null;
  const status = parsePagePackageJobStatusV1(value['status']);
  if (
    !status ||
    !isIdentifier(value['jobId']) ||
    value['jobId'] !== status.jobId ||
    !Array.isArray(value['libraryCleanupAssetIds']) ||
    value['libraryCleanupAssetIds'].length > MAX_STAGED_PAGES ||
    !value['libraryCleanupAssetIds'].every(isIdentifier) ||
    new Set(value['libraryCleanupAssetIds']).size !== value['libraryCleanupAssetIds'].length ||
    value['schemaVersion'] !== 1 ||
    (value['locale'] !== undefined &&
      value['locale'] !== null &&
      value['locale'] !== 'en' &&
      value['locale'] !== 'ru') ||
    !isNonNegativeInteger(value['updatedAt']) ||
    !Array.isArray(value['stagedPages']) ||
    value['stagedPages'].length > MAX_STAGED_PAGES
  )
    return null;
  const output = value['output'] === null ? null : parseOutput(value['output']);
  if (value['output'] !== null && !output) return null;
  const stagedPages = value['stagedPages'].map(parseStagedPage);
  if (stagedPages.some((page) => !page)) return null;
  const pages = stagedPages as PersistedStagedPage[];
  if (
    status.phase === 'completed' &&
    (output !== null || pages.length > 0 || value['libraryCleanupAssetIds'].length > 0)
  )
    return null;
  if (
    pages.some(
      (page) =>
        page.jobId !== status.jobId || status.orderedTabs[page.ordinal]?.tabId !== page.tabId
    ) ||
    new Set(pages.map((page) => page.ordinal)).size !== pages.length ||
    new Set(pages.map((page) => page.stagedBlobId)).size !== pages.length
  )
    return null;
  return {
    jobId: value['jobId'],
    libraryCleanupAssetIds: value['libraryCleanupAssetIds'] as string[],
    locale: value['locale'] === 'en' || value['locale'] === 'ru' ? value['locale'] : null,
    output,
    schemaVersion: 1,
    stagedPages: pages,
    status,
    updatedAt: value['updatedAt'],
  };
}
