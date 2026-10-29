import { parsePreparedScenarioProjectDependencies } from './scenario-dependencies';
import {
  applyPreparedScenarioReplica,
  parseApplyPreparedScenarioReplicaInput,
  type ApplyPreparedScenarioReplicaInput,
} from './apply-scenario';
import { collectPreparedScenarioReplicaRefs } from './prepared-scenario';
import { isBoundedScenarioMetadata } from './scenario-snapshot';
import { parseSyncConnectionIdentity } from '../remote-connection/model';
import {
  applyPreparedVideoReviewReplica,
  parseApplyPreparedVideoReviewReplicaInput,
  type ApplyPreparedVideoReviewReplicaInput,
} from './apply-review';
import { collectPreparedVideoReviewReplicaRefs } from './prepared-review';
import {
  collectPreparedProjectReplicaRefs,
  parsePreparedVideoProjectReplicaRoot,
} from './prepared-project';
import {
  applyPreparedImageReplica,
  parseApplyPreparedImageReplicaInput,
  type ApplyPreparedImageReplicaInput,
} from './apply-image';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createAssetPublicationJournal,
  cancelAssetPublication,
  parseAssetRef,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
} from '../assets';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { applyPreparedMediaReplica, type ApplyPreparedMediaReplicaInput } from './apply-media';
import {
  applyPreparedVideoProjectRevision,
  type ApplyPreparedVideoProjectRevisionInput,
} from './apply-video-project';
import { MAX_CAPTURE_METADATA_BYTES, MAX_CAPTURE_ROWS } from './contracts';
import { parseCapturedMediaRows } from './guards';

export type PreparedReplicaPayload =
  | { kind: 'scenario-project'; input: ApplyPreparedScenarioReplicaInput }
  | { kind: 'video-review'; input: ApplyPreparedVideoReviewReplicaInput }
  | { kind: 'image'; input: ApplyPreparedImageReplicaInput }
  | { kind: 'media'; input: ApplyPreparedMediaReplicaInput }
  | { kind: 'video-project'; input: ApplyPreparedVideoProjectRevisionInput };

const DOMAIN = 'sync-replica';
const logger = createLogger({ namespace: 'SyncReplicaPublication' });

function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Ready journals contain bounded JSON metadata, never binary sidecars or class instances. */
function assertJournalMetadata(value: unknown): void {
  let nodes = 0;
  let characters = 0;
  const active = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    if (++nodes > 100_000 || depth > 64) throw new Error('Invalid replica metadata.');
    if (typeof item === 'string') {
      characters += item.length;
      if (characters > MAX_CAPTURE_METADATA_BYTES) throw new Error('Invalid replica metadata.');
      return;
    }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || active.has(item)) throw new Error('Invalid replica metadata.');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
      throw new Error('Invalid replica metadata.');
    active.add(item);
    for (const [key, child] of Object.entries(item)) {
      characters += key.length;
      if (characters > MAX_CAPTURE_METADATA_BYTES) throw new Error('Invalid replica metadata.');
      if (child !== undefined || Array.isArray(item)) visit(child, depth + 1);
    }
    active.delete(item);
  }
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CAPTURE_METADATA_BYTES)
    throw new Error('Replica metadata exceeds its journal limit.');
}

function parseIdentity(value: Record<string, unknown>) {
  const authorization =
    value['authorization'] === undefined
      ? undefined
      : parseSyncConnectionIdentity(value['authorization']);
  if (authorization === null) throw new Error('Invalid replica authorization.');
  const spaceId = value['spaceId'];
  const profileCreatedAt = value['profileCreatedAt'];
  const expectedBasis = value['expectedBasis'];
  const operationId = value['operationId'];
  const sourceDigest = value['sourceDigest'];
  const connectionGeneration = value['connectionGeneration'];
  const expectedLocalGeneration = value['expectedLocalGeneration'];
  if (
    typeof spaceId !== 'string' ||
    !spaceId ||
    !ordinal(profileCreatedAt) ||
    !Array.isArray(expectedBasis) ||
    expectedBasis.length !== (expectedLocalGeneration === 0 ? 0 : 1) ||
    !expectedBasis.every(
      (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256
    ) ||
    typeof operationId !== 'string' ||
    !operationId ||
    operationId.length > 256 ||
    typeof sourceDigest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(sourceDigest) ||
    !ordinal(connectionGeneration) ||
    connectionGeneration === 0 ||
    !ordinal(expectedLocalGeneration)
  )
    throw new Error('Invalid replica identity.');
  return {
    ...(authorization ? { authorization } : {}),
    spaceId,
    profileCreatedAt,
    expectedBasis,
    operationId,
    sourceDigest,
    connectionGeneration,
    expectedLocalGeneration,
  };
}

function parseDependency(
  value: unknown
): ApplyPreparedVideoProjectRevisionInput['dependencies'][number] {
  if (!isRecord(value)) throw new Error('Invalid prepared project dependency.');
  const entry = parseMediaLibraryEntry(value['entry']);
  const ref = parseAssetRef(value['ref']);
  const expectedGeneration = value['expectedGeneration'];
  const basis = value['expectedBasis'];
  if (
    !entry ||
    entry.blob !== undefined ||
    !ref ||
    !ordinal(expectedGeneration) ||
    expectedGeneration === 0 ||
    !Array.isArray(basis) ||
    basis.length !== 1 ||
    typeof basis[0] !== 'string' ||
    !basis[0] ||
    basis[0].length > 256 ||
    entry.size !== ref.size ||
    entry.mimeType !== ref.mimeType
  )
    throw new Error('Invalid prepared project dependency.');
  return { entry, ref, expectedGeneration, expectedBasis: [basis[0]] };
}

function parseProjectInput(value: Record<string, unknown>): ApplyPreparedVideoProjectRevisionInput {
  const root = value['root'];
  const dependencies = value['dependencies'];
  const expectedWorkspaceRevision = value['expectedWorkspaceRevision'];
  if (
    !isRecord(root) ||
    !Array.isArray(root['assets']) ||
    root['assets'].length > MAX_CAPTURE_ROWS ||
    !Array.isArray(dependencies) ||
    dependencies.length > MAX_CAPTURE_ROWS ||
    (expectedWorkspaceRevision !== null && !ordinal(expectedWorkspaceRevision))
  )
    throw new Error('Unsupported prepared project journal.');
  const prepared = parsePreparedVideoProjectReplicaRoot(root);
  return {
    ...parseIdentity(value),
    expectedWorkspaceRevision,
    root: prepared,
    dependencies: dependencies.map(parseDependency),
    ...(value['rootDependencies'] === undefined
      ? {}
      : { rootDependencies: parsePreparedScenarioProjectDependencies(value['rootDependencies']) }),
  };
}

function parsePayload(value: unknown): PreparedReplicaPayload {
  if (isRecord(value) && value['kind'] === 'scenario-project') {
    if (!isBoundedScenarioMetadata(value, false))
      throw new Error('Scenario journal metadata exceeds its profile.');
  } else assertJournalMetadata(value);
  if (!isRecord(value) || !isRecord(value['input'])) throw new Error('Invalid replica payload.');
  const input = value['input'];
  if (value['kind'] === 'scenario-project')
    return { kind: 'scenario-project', input: parseApplyPreparedScenarioReplicaInput(input) };
  if (value['kind'] === 'video-review') {
    const review = parseApplyPreparedVideoReviewReplicaInput(input);
    if (!review) throw new Error('Invalid video review replica.');
    return { kind: 'video-review', input: review };
  }
  if (value['kind'] === 'video-project')
    return { kind: 'video-project', input: parseProjectInput(input) };
  if (value['kind'] === 'image') {
    const image = parseApplyPreparedImageReplicaInput(input);
    if (!image) throw new Error('Invalid image replica.');
    return { kind: 'image', input: image };
  }
  if (value['kind'] !== 'media') throw new Error('Unsupported replica kind.');
  const rows = parseCapturedMediaRows(input['rows']);
  if (!rows) throw new Error('Invalid media replica.');
  return { kind: 'media', input: { ...parseIdentity(input), rows } };
}

function protectedRefs(payload: PreparedReplicaPayload): AssetRef[] {
  const refs =
    payload.kind === 'scenario-project'
      ? [
          ...collectPreparedScenarioReplicaRefs(payload.input.root),
          ...payload.input.dependencies.map((item) => item.ref),
        ]
      : payload.kind === 'image'
        ? [
            payload.input.originalRef,
            ...payload.input.documentRefs,
            ...(payload.input.presentation
              ? [
                  payload.input.presentation.thumbnailRef,
                  ...(payload.input.presentation.previewRef
                    ? [payload.input.presentation.previewRef]
                    : []),
                ]
              : []),
          ]
        : payload.kind === 'media'
          ? [
              payload.input.rows.ref,
              ...('screenshotRef' in payload.input.rows ? [payload.input.rows.screenshotRef] : []),
            ]
          : payload.kind === 'video-review'
            ? [
                ...collectPreparedVideoReviewReplicaRefs(payload.input.root),
                ...payload.input.dependencies.map((dependency) => dependency.ref),
              ]
            : [
                ...collectPreparedProjectReplicaRefs(payload.input.root),
                ...payload.input.dependencies.map((dependency) => dependency.ref),
                ...(payload.input.rootDependencies ?? []).flatMap((dependency) =>
                  dependency.children.map((child) => child.ref)
                ),
              ];
  const unique = new Map<string, AssetRef>();
  for (const ref of refs) {
    const previous = unique.get(ref.assetId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(ref))
      throw new Error('Conflicting replica asset references.');
    unique.set(ref.assetId, ref);
  }
  return [...unique.values()];
}

function assertJournalClaims(journal: AssetReadyJournal, refs: AssetRef[]): void {
  if (
    journal.domain !== DOMAIN ||
    journal.operationId !== undefined ||
    journal.assetRefs.length !== refs.length
  )
    throw new Error('Invalid replica journal claims.');
  const expected = new Map(refs.map((ref) => [ref.assetId, JSON.stringify(ref)]));
  for (const raw of journal.assetRefs) {
    const ref = parseAssetRef(raw);
    if (!ref || expected.get(ref.assetId) !== JSON.stringify(ref))
      throw new Error('Replica journal claims differ from its prepared sources.');
    expected.delete(ref.assetId);
  }
  if (expected.size) throw new Error('Missing replica journal claims.');
}

/** Caller verifies sourceDigest and physical bytes before durable preparation. */
export async function createPreparedReplicaJournal(
  payload: PreparedReplicaPayload,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<AssetReadyJournal<PreparedReplicaPayload>> {
  const parsed = structuredClone(parsePayload(payload));
  return createAssetPublicationJournal({
    domain: DOMAIN,
    payload: parsed,
    assetRefs: protectedRefs(parsed),
    ...(lifecyclePermit ? { lifecyclePermit } : {}),
  });
}

/** The existing retry and recovery owners remove the ready journal after native commit. */
export async function publishPreparedReplicaJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  const payload = parsePayload(journal.payload);
  assertJournalClaims(journal, protectedRefs(payload));
  if (payload.kind === 'scenario-project') {
    await applyPreparedScenarioReplica(payload.input, lifecyclePermit);
    await cancelAssetPublication(journal, lifecyclePermit);
  } else if (payload.kind === 'video-review') {
    await applyPreparedVideoReviewReplica(payload.input, lifecyclePermit);
    await cancelAssetPublication(journal, lifecyclePermit);
  } else if (payload.kind === 'image') {
    await applyPreparedImageReplica(payload.input, lifecyclePermit);
    await cancelAssetPublication(journal, lifecyclePermit);
  } else if (payload.kind === 'media')
    await applyPreparedMediaReplica(payload.input, lifecyclePermit);
  else await applyPreparedVideoProjectRevision(payload.input, lifecyclePermit);
}

export const syncReplicaPublicationAdapter: AssetPublicationAdapter = {
  domain: DOMAIN,
  async publish(journal, permit) {
    try {
      await publishPreparedReplicaJournal(journal, permit);
    } catch {
      logger.warn('Prepared replica publication was deferred; its durable journal remains.');
      return 'defer';
    }
  },
};
