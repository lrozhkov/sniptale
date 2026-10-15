import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  assertSafeArchivePath,
  sanitizeArchivePathSegment,
} from '../../../composition/archive-transfer';

export const MEDIA_HUB_BACKUP_LAYOUT = 'library-folders-v1';
export const MEDIA_HUB_BACKUP_PAYLOAD_LAYOUT = 'library-folders-v2';
export const MEDIA_HUB_BACKUP_SHARED_LAYOUT = 'library-folders-v3';
export const MEDIA_HUB_BACKUP_PROJECT_LAYOUT = 'library-folders-v4';
export type MediaHubBackupLayout =
  | typeof MEDIA_HUB_BACKUP_LAYOUT
  | typeof MEDIA_HUB_BACKUP_PAYLOAD_LAYOUT
  | typeof MEDIA_HUB_BACKUP_SHARED_LAYOUT
  | typeof MEDIA_HUB_BACKUP_PROJECT_LAYOUT;

/** Both admitted shared layouts use the same byte and alias resource profile. */
export function isSharedBackupLayout(
  value: unknown
): value is typeof MEDIA_HUB_BACKUP_SHARED_LAYOUT | typeof MEDIA_HUB_BACKUP_PROJECT_LAYOUT {
  return value === MEDIA_HUB_BACKUP_SHARED_LAYOUT || value === MEDIA_HUB_BACKUP_PROJECT_LAYOUT;
}

/** Checks admitted JSON inventory, including reviews nested in montage resources. */
export function hasReviewProjectMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasReviewProjectMetadata);
  if (!isRecord(value)) return false;
  const review = value['videoReview'];
  if (isRecord(review) && isRecord(review['workspace']) && 'project' in review['workspace'])
    return true;
  return Object.values(value).some(hasReviewProjectMetadata);
}

/** Legacy layouts cannot carry the new authoritative project contract. */
export function assertReviewProjectLayout(value: unknown, layout: MediaHubBackupLayout): void {
  if (layout !== MEDIA_HUB_BACKUP_PROJECT_LAYOUT && hasReviewProjectMetadata(value))
    throw new Error('Review project metadata requires library-folders-v4.');
}
export const MANIFEST_PATH = '_sniptale/manifest.json';
export const CATALOG_ROOT = '_sniptale/catalog';
export const METADATA_ROOT = '_sniptale/metadata';
const INTERNAL_ASSET_ROOT = '_sniptale/assets';

const USER_ROOTS = [
  'Screenshots',
  'Recordings',
  'Audio',
  'Exports',
  'Web snapshots',
  'Scenarios',
] as const;

export function createInternalObjectSegments(objectId: string, filename: string): string[] {
  return ['_sniptale', 'assets', objectId, filename];
}

export function withDraftRoot(isDraft: boolean, segments: readonly string[]): string[] {
  return isDraft ? ['Drafts', ...segments] : [...segments];
}

export function assertV6ObjectPath(path: string, objectId: string, filename: string): void {
  assertSafeArchivePath(path);
  const segments = path.split('/');
  if (path.startsWith(`${INTERNAL_ASSET_ROOT}/`)) {
    if (
      segments.length !== 4 ||
      segments[0] !== '_sniptale' ||
      segments[1] !== 'assets' ||
      segments[2] !== sanitizeArchivePathSegment(objectId) ||
      segments[3] !== sanitizeArchivePathSegment(filename)
    ) {
      throw new Error('Media backup internal object path is invalid.');
    }
    return;
  }
  const root = segments[0];
  const userRoot = root === 'Drafts' ? segments[1] : root;
  if (
    !userRoot ||
    !USER_ROOTS.some((candidate) => candidate === userRoot) ||
    segments.length < (root === 'Drafts' ? 3 : 2)
  ) {
    throw new Error('Media backup object path is outside the v6 library layout.');
  }
}

export function assertV6CatalogPath(path: string): void {
  assertSafeArchivePath(path);
  const prefix = `${CATALOG_ROOT}/`;
  if (!path.startsWith(prefix))
    throw new Error('Media backup catalog path is outside the v6 layout.');
  const filename = path.slice(prefix.length);
  const labels = ['media', 'effect-bundles', 'video-projects', 'scenario-projects'];
  const label = labels.find((candidate) => filename.startsWith(`${candidate}-`));
  if (!label || !filename.endsWith('.ndjson')) {
    throw new Error('Media backup catalog path is invalid.');
  }
  const sequence = filename.slice(label.length + 1, -'.ndjson'.length);
  if (
    sequence.length !== 6 ||
    Array.from(sequence).some((character) => character < '0' || character > '9')
  ) {
    throw new Error('Media backup catalog path is invalid.');
  }
}

export function assertV6MetadataPath(
  path: string,
  rootKind: 'media' | 'video-project' | 'scenario-project',
  rootId: string,
  mediaSubtype?: 'library-item' | 'effect-bundle'
): void {
  assertSafeArchivePath(path);
  const profile =
    rootKind === 'media'
      ? 'media'
      : rootKind === 'video-project'
        ? 'video-projects'
        : 'scenario-projects';
  const segments = path.split('/');
  const portableLeafId =
    rootKind === 'media' && mediaSubtype === 'effect-bundle' ? `effect-bundle-${rootId}` : rootId;
  if (
    segments.length !== 4 ||
    segments[0] !== '_sniptale' ||
    segments[1] !== 'metadata' ||
    segments[2] !== profile ||
    segments[3] !== `${encodeURIComponent(portableLeafId)}.json`
  ) {
    throw new Error('Media backup root metadata path does not match its profile.');
  }
}
