import { portableSyncRootDependencyIds } from './prepared-scenario';
import {
  captureProfileBounds,
  type CausalRootDependency,
} from '../../composition/persistence/sync-capture/contracts';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseBoundedJson } from '../media-hub-backup/v6/codec';
import type { MediaHubBackupRootEnvelope } from '../media-hub-backup/v6/contracts';
import { parsePortableSyncRoot, portableSyncDependencyIds } from './prepared-root';

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

/** Logical changes contain portable metadata and hashes, never native file locations. */
interface SyncOperation {
  format: 'sniptale-sync-operation';
  version: 1;
  spaceId: string;
  operationId: string;
  rootKind: 'media' | 'video-project' | 'video-review' | 'scenario-project';
  rootId: string;
  reviewSourceMediaId?: string;
  kind: 'edit' | 'restore' | 'delete';
  parents: string[];
  dependencies: { mediaId: string; basis: string[] }[];
  rootDependencies?: CausalRootDependency[];
  envelope: MediaHubBackupRootEnvelope | null;
  objects: { objectId: string; sha256: string }[];
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid sync record.');
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
function identities(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(identity) &&
    new Set(value).size === value.length
  );
}
function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function fields(value: Record<string, unknown>, expected: readonly string[]) {
  check(Object.keys(value).length === expected.length && expected.every((key) => key in value));
}

/** SHA256 over exact UTF8 metadata bytes; large files use the existing streamed backup digest. */
export function hashSyncText(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function parseDependencies(value: unknown, rootKind?: unknown): SyncOperation['dependencies'] {
  check(Array.isArray(value) && value.length <= captureProfileBounds(rootKind).rows);
  const dependencies = value.map((item) => {
    check(isRecord(item));
    fields(item, ['mediaId', 'basis']);
    check(identity(item['mediaId']) && identities(item['basis']) && item['basis'].length > 0);
    return { mediaId: item['mediaId'], basis: item['basis'] };
  });
  check(new Set(dependencies.map((item) => item.mediaId)).size === dependencies.length);
  return dependencies;
}
function parseObjects(value: unknown, rootKind?: unknown): SyncOperation['objects'] {
  check(Array.isArray(value) && value.length <= captureProfileBounds(rootKind).objects);
  const objects = value.map((item) => {
    check(isRecord(item));
    fields(item, ['objectId', 'sha256']);
    check(identity(item['objectId']) && digest(item['sha256']));
    return { objectId: item['objectId'], sha256: item['sha256'] };
  });
  check(new Set(objects.map((item) => item.objectId)).size === objects.length);
  return objects;
}

function parseRootDependencies(value: unknown): CausalRootDependency[] {
  check(Array.isArray(value) && value.length > 0 && value.length <= 32);
  const dependencies = value.map((item): CausalRootDependency => {
    check(isRecord(item));
    fields(item, ['rootKind', 'rootId', 'basis', 'childIds']);
    check(
      item['rootKind'] === 'scenario-project' &&
        identity(item['rootId']) &&
        identities(item['basis']) &&
        item['basis'].length === 1 &&
        identities(item['childIds'])
    );
    check(JSON.stringify(item['childIds']) === JSON.stringify([...item['childIds']].sort()));
    return {
      rootKind: 'scenario-project',
      rootId: item['rootId'],
      basis: item['basis'],
      childIds: item['childIds'],
    };
  });
  check(new Set(dependencies.map((item) => item.rootId)).size === dependencies.length);
  check(
    JSON.stringify(dependencies.map((item) => item.rootId)) ===
      JSON.stringify(dependencies.map((item) => item.rootId).sort())
  );
  return dependencies;
}

/** Parse bounded versioned logical bytes through the existing domain codec before admission. */
export async function parseSyncOperationText(text: string): Promise<SyncOperation> {
  const value = parseBoundedJson(text, MAX_TEXT_BYTES);
  check(isRecord(value));
  fields(value, [
    'format',
    'version',
    'spaceId',
    'operationId',
    'rootKind',
    'rootId',
    ...('reviewSourceMediaId' in value ? ['reviewSourceMediaId'] : []),
    'kind',
    'parents',
    'dependencies',
    ...('rootDependencies' in value ? ['rootDependencies'] : []),
    'envelope',
    'objects',
  ]);
  check(value['format'] === 'sniptale-sync-operation' && value['version'] === 1);
  check(identity(value['spaceId']) && identity(value['operationId']) && identity(value['rootId']));
  check(
    value['rootKind'] === 'media' ||
      value['rootKind'] === 'video-project' ||
      value['rootKind'] === 'video-review' ||
      value['rootKind'] === 'scenario-project'
  );
  check(value['kind'] === 'edit' || value['kind'] === 'restore' || value['kind'] === 'delete');
  const hasReviewSource = 'reviewSourceMediaId' in value;
  check(hasReviewSource === (value['rootKind'] === 'video-review' && value['kind'] !== 'delete'));
  const reviewSourceMediaId = hasReviewSource ? value['reviewSourceMediaId'] : undefined;
  check(reviewSourceMediaId === undefined || identity(reviewSourceMediaId));
  check(identities(value['parents']) && !value['parents'].includes(value['operationId']));
  const dependencies = parseDependencies(value['dependencies'], value['rootKind']);
  const rootDependencies =
    'rootDependencies' in value ? parseRootDependencies(value['rootDependencies']) : undefined;
  const objects = parseObjects(value['objects'], value['rootKind']);
  const portable =
    value['envelope'] === null
      ? null
      : await parsePortableSyncRoot(value['envelope'], reviewSourceMediaId);
  const envelope = portable?.envelope ?? null;
  const needed = portable
    ? portableSyncDependencyIds(
        portable,
        dependencies.map((item) => item.mediaId)
      )
    : [];
  if (portable) portableSyncRootDependencyIds(portable, rootDependencies ?? []);
  else check(rootDependencies === undefined);
  check(JSON.stringify(needed) === JSON.stringify(dependencies.map((item) => item.mediaId).sort()));
  if (value['kind'] === 'delete')
    check(envelope === null && objects.length === 0 && dependencies.length === 0);
  else {
    check(
      envelope &&
        (portable?.kind === 'video-review'
          ? value['rootKind'] === 'video-review'
          : envelope.descriptor.rootKind === value['rootKind']) &&
        envelope.descriptor.rootId === value['rootId']
    );
    check(
      envelope.objects.length === objects.length &&
        envelope.objects.every((item) =>
          objects.some((object) => object.objectId === item.objectId)
        )
    );
  }
  if (value['rootKind'] === 'media') check(dependencies.length === 0);
  const operation: SyncOperation = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: value['spaceId'],
    operationId: value['operationId'],
    rootKind: value['rootKind'],
    rootId: value['rootId'],
    ...(reviewSourceMediaId === undefined ? {} : { reviewSourceMediaId }),
    kind: value['kind'],
    parents: value['parents'],
    dependencies,
    ...(rootDependencies === undefined ? {} : { rootDependencies }),
    envelope,
    objects,
  };
  check(JSON.stringify(operation) === text);
  return operation;
}

/** Check an existing file reference with the same rules as fresh physical manifests. */
export function isSyncObjectRemoteKey(
  spaceId: string,
  filename: string,
  remoteKey: string
): boolean {
  if (
    !filename ||
    /[\\/?#:]/u.test(filename) ||
    filename === '.' ||
    filename === '..' ||
    remoteKey.length > 2048
  )
    return false;
  const parts = remoteKey.split('/');
  if (
    parts.length !== 5 ||
    parts[0] !== 'Files' ||
    parts[1] !== hashSyncText(spaceId) ||
    !UUID.test(parts[2] ?? '') ||
    !identity(parts[3]) ||
    parts[3] === '.' ||
    parts[3] === '..' ||
    /[\\/?#:%]/u.test(parts[3] ?? '') ||
    parts[4] !== filename
  )
    return false;
  return Array.from(filename + parts[3]).every(
    (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
  );
}

function objectKeys(
  operation: SyncOperation,
  attemptId: string,
  retained?: { objectId: string; remoteKey: string }[]
) {
  if (retained) check(retained.length === (operation.envelope?.objects.length ?? 0));
  return (operation.envelope?.objects ?? []).map((object) => {
    check(identity(object.objectId) && !/[\\/?#:%]/u.test(object.objectId));
    const proposed = retained?.find((item) => item.objectId === object.objectId);
    if (retained) check(proposed);
    const remoteKey =
      proposed?.remoteKey ??
      `Files/${hashSyncText(operation.spaceId)}/${attemptId}/${object.objectId}/${object.filename}`;
    check(isSyncObjectRemoteKey(operation.spaceId, object.filename, remoteKey));
    return { objectId: object.objectId, remoteKey };
  });
}

function physicalText(
  operationText: string,
  attemptId: string,
  objects: { objectId: string; remoteKey: string }[]
) {
  return JSON.stringify({
    format: 'sniptale-sync-attempt',
    version: 1,
    attemptId,
    operationText,
    operationSha256: hashSyncText(operationText),
    objects,
  });
}

/** Freeze canonical fresh or retained same-space file mappings under an independent manifest. */
export async function createSyncAttempt(
  operationText: string,
  attemptId: string,
  retained?: { objectId: string; remoteKey: string }[]
) {
  check(UUID.test(attemptId));
  const operation = await parseSyncOperationText(operationText);
  const objects = objectKeys(operation, attemptId, retained);
  check(new Set(objects.map((item) => item.remoteKey)).size === objects.length);
  const recordText = physicalText(operationText, attemptId, objects);
  check(new TextEncoder().encode(recordText).byteLength <= MAX_TEXT_BYTES);
  const recordSha256 = hashSyncText(recordText);
  return {
    attemptId,
    recordText,
    recordSha256,
    recordKey: `.sniptale/${hashSyncText(operation.spaceId)}/records/${attemptId}-${recordSha256}.json`,
    objects,
  };
}

/** Reject changed mappings, unknown fields and noncanonical physical or logical bytes. */
export async function parseSyncAttemptText(text: string) {
  const value = parseBoundedJson(text, MAX_TEXT_BYTES);
  check(isRecord(value));
  fields(value, ['format', 'version', 'attemptId', 'operationText', 'operationSha256', 'objects']);
  check(value['format'] === 'sniptale-sync-attempt' && value['version'] === 1);
  check(typeof value['attemptId'] === 'string' && UUID.test(value['attemptId']));
  check(
    typeof value['operationText'] === 'string' &&
      hashSyncText(value['operationText']) === value['operationSha256']
  );
  const operation = await parseSyncOperationText(value['operationText']);
  check(
    Array.isArray(value['objects']) &&
      value['objects'].length <= captureProfileBounds(operation.rootKind).objects
  );
  const objects = value['objects'].map((item) => {
    check(isRecord(item));
    fields(item, ['objectId', 'remoteKey']);
    check(identity(item['objectId']) && typeof item['remoteKey'] === 'string');
    return { objectId: item['objectId'], remoteKey: item['remoteKey'] };
  });
  const expected = await createSyncAttempt(value['operationText'], value['attemptId'], objects);
  check(expected.recordText === text);
  return { ...expected, operation };
}
