import { parseCapturedMediaRows } from './media-snapshot';
export { parseCapturedMediaRows } from './media-snapshot';
import { parseCapturedVideoReviewRows, type CapturedVideoReviewRows } from './review-snapshot';
import { parseCapturedVideoProjectRows } from './project-snapshot';
export { isSupportedCaptureProject, parseCapturedVideoProjectRows } from './project-snapshot';
import { describeImageMetadata, parseCapturedImageRows } from './image-snapshot';
export { parseCapturedImageRows } from './image-snapshot';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAssetRef } from '../assets/guards';
import {
  captureRootKey,
  MAX_CAPTURE_METADATA_BYTES,
  MAX_CAPTURE_ROWS,
  type CapturedMediaDependency,
  type CapturedChange,
  type CaptureOperation,
  type CaptureOperationHeader,
  type PreparedCaptureOperation,
  type PublishedCaptureOperation,
  type SyncCaptureAppliedOperation,
  type SyncCaptureProfile,
  type SyncCaptureRootState,
  type SyncCaptureRecord,
} from './contracts';

function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function storageKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Bind every retained published source to its accepted causal head. */
function parseReviewDependencies(
  value: unknown,
  rows: CapturedVideoReviewRows
): CapturedMediaDependency[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CAPTURE_ROWS) return null;
  const required = new Set([rows.source.media.id, ...rows.media.map((entry) => entry.id)]);
  const dependencies: CapturedMediaDependency[] = [];
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !identity(raw['mediaId']) ||
      !ordinal(raw['generation']) ||
      raw['generation'] === 0 ||
      !Array.isArray(raw['basis']) ||
      raw['basis'].length !== 1 ||
      !raw['basis'].every(identity) ||
      !required.delete(raw['mediaId'])
    )
      return null;
    dependencies.push({
      mediaId: raw['mediaId'],
      generation: raw['generation'],
      basis: [...raw['basis']],
    });
  }
  return required.size === 0 ? dependencies : null;
}

type CaptureRecordHeader = Pick<SyncCaptureRecord, 'version' | 'key' | 'createdAt' | 'spaceId'>;
type CaptureRoot = Pick<
  SyncCaptureRootState,
  'rootKind' | 'rootId' | 'rootKey' | 'generation' | 'basis'
>;

function parseCaptureHeader(value: Record<string, unknown>): CaptureRecordHeader | null {
  if (
    value['version'] !== 1 ||
    !storageKey(value['key']) ||
    !ordinal(value['createdAt']) ||
    !identity(value['spaceId'])
  )
    return null;
  return {
    version: 1,
    key: value['key'],
    createdAt: value['createdAt'],
    spaceId: value['spaceId'],
  };
}

function parseCaptureProfile(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): SyncCaptureProfile | null {
  if (
    value['key'] !== 'profile' ||
    typeof value['enabled'] !== 'boolean' ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] === 0
  )
    return null;
  return {
    ...header,
    kind: 'profile',
    key: 'profile',
    enabled: value['enabled'],
    connectionGeneration: value['connectionGeneration'],
  };
}

function parseAppliedOperation(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): SyncCaptureAppliedOperation | null {
  if (
    !storageKey(value['rootKey']) ||
    !ordinal(value['generation']) ||
    value['generation'] === 0 ||
    !identity(value['operationId']) ||
    typeof value['sourceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sourceDigest'])
  )
    return null;
  return {
    ...header,
    kind: 'applied-operation',
    rootKey: value['rootKey'],
    generation: value['generation'],
    operationId: value['operationId'],
    sourceDigest: value['sourceDigest'],
  };
}

function parseCaptureRoot(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): CaptureRoot | null {
  if (
    !storageKey(value['rootKey']) ||
    !ordinal(value['generation']) ||
    value['generation'] === 0 ||
    (value['rootKind'] !== 'video-project' &&
      value['rootKind'] !== 'media' &&
      value['rootKind'] !== 'video-review') ||
    !identity(value['rootId']) ||
    captureRootKey(header.spaceId, value['rootKind'], value['rootId']) !== value['rootKey'] ||
    !Array.isArray(value['basis']) ||
    value['basis'].length > MAX_CAPTURE_ROWS
  )
    return null;
  const basis: unknown[] = value['basis'];
  if (!basis.every(identity) || new Set(basis).size !== basis.length) return null;
  return {
    rootKind: value['rootKind'],
    rootId: value['rootId'],
    rootKey: value['rootKey'],
    generation: value['generation'],
    basis,
  };
}

/** Fingerprint normalized native input independently of object property order. */
export function fingerprintNativeCapture(value: Omit<CapturedChange, 'sourceSha256'>): string {
  const canonical = (item: unknown): unknown => {
    if (item instanceof Blob) return describeImageMetadata(item);
    if (Array.isArray(item)) return item.map(canonical);
    if (isRecord(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonical(item[key])])
      );
    return item;
  };
  const change = value.change;
  const normalizedChange =
    change.kind === 'media'
      ? { kind: change.kind, rows: parseCapturedMediaRows(change.rows) ?? change.rows }
      : change.kind === 'image'
        ? { kind: change.kind, rows: parseCapturedImageRows(change.rows) ?? change.rows }
        : change.kind === 'video-project'
          ? { kind: change.kind, rows: parseCapturedVideoProjectRows(change.rows) ?? change.rows }
          : change;
  return hashCaptureText(
    JSON.stringify(
      canonical(
        Object.fromEntries(
          Object.entries({ ...value, change: normalizedChange }).filter(
            ([key]) => key !== 'sourceSha256'
          )
        )
      )
    )
  );
}

export function hashCaptureText(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
function captureDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function captureRemoteKey(value: unknown): value is string {
  return (
    storageKey(value) &&
    !/[\\?#:]/u.test(value) &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    ) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}
/** Validate actual immutable portable object bindings without adding phase-specific fields. */
export function parseCaptureObjectBindings(
  value: unknown
): PreparedCaptureOperation['prepared']['objects'] | null {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS * 2) return null;
  const objects: PreparedCaptureOperation['prepared']['objects'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const ref = parseAssetRef(item['ref']);
    if (
      !ref ||
      !identity(item['objectId']) ||
      !captureDigest(item['sha256']) ||
      (ref.sha256 !== null && ref.sha256 !== item['sha256']) ||
      !storageKey(item['filename'])
    )
      return null;
    objects.push({
      objectId: item['objectId'],
      ref,
      sha256: item['sha256'],
      filename: item['filename'],
    });
  }
  return new Set(objects.map((item) => item.objectId)).size === objects.length ? objects : null;
}
function parsePublishedObjects(value: unknown): PublishedCaptureOperation['objects'] | null {
  const bindings = parseCaptureObjectBindings(value);
  if (!bindings || !Array.isArray(value)) return null;
  const objects: PublishedCaptureOperation['objects'] = [];
  for (const [index, binding] of bindings.entries()) {
    const item: unknown = value[index];
    if (
      !isRecord(item) ||
      !captureRemoteKey(item['remoteKey']) ||
      typeof item['pinned'] !== 'boolean'
    )
      return null;
    objects.push({ ...binding, remoteKey: item['remoteKey'], pinned: item['pinned'] });
  }
  return new Set(objects.map((item) => item.remoteKey)).size === objects.length ? objects : null;
}
function parseCapturedChange(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): CaptureOperation | null {
  const root = parseCaptureRoot(value, header);
  const source = value['source'];
  if (
    !root ||
    !identity(value['operationId']) ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] === 0 ||
    !ordinal(value['profileCreatedAt']) ||
    !captureDigest(value['sourceSha256']) ||
    (value['origin'] !== 'local-edit' && value['origin'] !== 'local-restore') ||
    !(value['publicationId'] === null || identity(value['publicationId'])) ||
    !isRecord(source) ||
    (source['changeKind'] !== 'image' &&
      source['changeKind'] !== 'media' &&
      source['changeKind'] !== 'video-project' &&
      source['changeKind'] !== 'video-review' &&
      source['changeKind'] !== 'tombstone') ||
    typeof source['label'] !== 'string' ||
    source['label'].length === 0 ||
    source['label'].length > MAX_CAPTURE_METADATA_BYTES
  )
    return null;
  const stable: CaptureOperationHeader = {
    ...header,
    ...root,
    kind: 'sync-operation',
    profileCreatedAt: value['profileCreatedAt'],
    sourceSha256: value['sourceSha256'],
    source: { changeKind: source['changeKind'], label: source['label'] },
    operationId: value['operationId'],
    connectionGeneration: value['connectionGeneration'],
    origin: value['origin'],
    publicationId: value['publicationId'],
  };
  if (value['phase'] === 'native') {
    if ('prepared' in value || 'publication' in value || 'objects' in value) return null;
    const change = value['change'];
    if (!isRecord(change)) return null;
    const rows =
      change['kind'] === 'video-project' ? parseCapturedVideoProjectRows(change['rows']) : null;
    const mediaRows = change['kind'] === 'media' ? parseCapturedMediaRows(change['rows']) : null;
    const imageRows = change['kind'] === 'image' ? parseCapturedImageRows(change['rows']) : null;
    const reviewRows =
      change['kind'] === 'video-review' ? parseCapturedVideoReviewRows(change['rows']) : null;
    let parsedChange: CapturedChange['change'];
    if (change['kind'] === 'tombstone') parsedChange = { kind: 'tombstone' };
    else if (
      reviewRows &&
      reviewRows.review.workspace.aggregateId === root.rootId &&
      root.rootKind === 'video-review'
    ) {
      const mediaDependencies = parseReviewDependencies(change['mediaDependencies'], reviewRows);
      if (!mediaDependencies) return null;
      parsedChange = { kind: 'video-review', rows: reviewRows, mediaDependencies };
    } else if (rows && rows.project.id === root.rootId && root.rootKind === 'video-project')
      parsedChange = { kind: 'video-project', rows };
    else if (mediaRows && mediaRows.media.id === root.rootId && root.rootKind === 'media')
      parsedChange = { kind: 'media', rows: mediaRows };
    else if (imageRows && imageRows.media.id === root.rootId && root.rootKind === 'media')
      parsedChange = { kind: 'image', rows: imageRows };
    else return null;
    const native: CapturedChange = { ...stable, phase: 'native', change: parsedChange };
    return native.source.changeKind === parsedChange.kind &&
      fingerprintNativeCapture(native) === native.sourceSha256
      ? native
      : null;
  }
  if (value['phase'] === 'prepared') {
    if ('change' in value || 'publication' in value || 'objects' in value) return null;
    const prepared = value['prepared'];
    if (
      !isRecord(prepared) ||
      typeof prepared['recordText'] !== 'string' ||
      new TextEncoder().encode(prepared['recordText']).byteLength > 4 * 1024 * 1024 ||
      !captureDigest(prepared['recordSha256']) ||
      hashCaptureText(prepared['recordText']) !== prepared['recordSha256'] ||
      !Array.isArray(prepared['objects'])
    )
      return null;
    const objects = parseCaptureObjectBindings(prepared['objects']);
    if (!objects) return null;
    return {
      ...stable,
      phase: 'prepared',
      prepared: {
        recordText: prepared['recordText'],
        recordSha256: prepared['recordSha256'],
        objects,
      },
    };
  }
  if (value['phase'] === 'published') {
    if ('change' in value || 'prepared' in value) return null;
    const fact = value['publication'];
    const objects = parsePublishedObjects(value['objects']);
    if (
      !objects ||
      !isRecord(fact) ||
      (fact['kind'] !== 'verified' && fact['kind'] !== 'observed') ||
      !ordinal(fact['acceptedAt']) ||
      !captureDigest(fact['preparedSha256']) ||
      typeof fact['attemptId'] !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(fact['attemptId']) ||
      !captureRemoteKey(fact['recordKey']) ||
      !captureDigest(fact['recordSha256'])
    )
      return null;
    return {
      ...stable,
      phase: 'published',
      publication: {
        kind: fact['kind'],
        acceptedAt: fact['acceptedAt'],
        preparedSha256: fact['preparedSha256'],
        attemptId: fact['attemptId'],
        recordKey: fact['recordKey'],
        recordSha256: fact['recordSha256'],
      },
      objects,
    };
  }
  return null;
}

/** Legacy root states have no native digest; new media states retain their admitted fingerprint. */
function parseCaptureRootState(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): SyncCaptureRootState | null {
  const root = parseCaptureRoot(value, header);
  if (!root) return null;
  const nativeDigest = value['nativeDigest'];
  const nativeRevision = value['nativeRevision'];
  if (
    nativeRevision !== undefined &&
    (!ordinal(nativeRevision) || (root.rootKind !== 'media' && root.rootKind !== 'video-review'))
  )
    return null;
  const deleted = value['deleted'];
  if (deleted !== undefined && deleted !== true) return null;
  if (deleted === true && nativeDigest !== undefined) return null;
  if (
    nativeDigest !== undefined &&
    (typeof nativeDigest !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(nativeDigest) ||
      (root.rootKind !== 'media' && root.rootKind !== 'video-review'))
  )
    return null;
  return {
    ...header,
    ...root,
    kind: 'root-state',
    ...(nativeDigest === undefined ? {} : { nativeDigest }),
    ...(nativeRevision === undefined ? {} : { nativeRevision }),
    ...(deleted === true ? { deleted: true } : {}),
  };
}

/** Unknown or malformed capture data refuses mutation and physical cleanup. */
export function parseSyncCaptureRecord(value: unknown): SyncCaptureRecord | null {
  if (!isRecord(value)) return null;
  const header = parseCaptureHeader(value);
  if (!header) return null;
  switch (value['kind']) {
    case 'profile':
      return parseCaptureProfile(value, header);
    case 'applied-operation':
      return parseAppliedOperation(value, header);
    case 'root-state':
      return parseCaptureRootState(value, header);
    case 'sync-operation':
      return parseCapturedChange(value, header);
    default:
      return null;
  }
}
