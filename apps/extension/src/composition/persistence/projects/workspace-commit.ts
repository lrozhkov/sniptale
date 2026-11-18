import type { VideoProject } from '../../../features/video/project/types';
import { hasExactKeys, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isSha256Digest } from '@sniptale/platform/security/digest';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import type { VideoProjectHistoryCapture } from '../../../features/video/project/history-capture';
import { isHydratableVideoProject } from '../../../features/video/project/validation';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  collectPreparedAssetCleanupFailures,
  createAssetPublicationJournal,
  publishReadyJournalWithRetry,
  releaseAssetReadyProtection,
  type AssetRef,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  parseAssetRef,
  recoverStandaloneAssetPublications,
  SupersededAssetPublicationError,
} from '../assets';
import { throwAssetPreparationError } from '../assets/opfs-store';
import {
  commitPreparedVideoProjectWorkspace,
  readVideoProjectWorkspacePublicationStatus,
  type VideoProjectSaveResult,
} from './index';
import { guardStaleVideoProjectSave } from './index.save-guard';
import { readVideoProjectRevisionSnapshot } from './revisions';
import {
  preparePersistedVideoProjectHistory,
  hydratePersistedVideoProjectHistory,
} from './history-codec';
import { recoverProjectMediaPublications } from './asset-publication';
import {
  VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN,
  type PreparedVideoProjectWorkspaceWrite,
  parsePersistedVideoProjectHistory,
  videoProjectHistoryAssetBindings,
  videoProjectHistoryChangeRefs,
} from './history-contracts';

interface VideoProjectWorkspaceCommitInput {
  project: VideoProject;
  history: VideoProjectHistoryCapture;
  expectedProject: VideoProject | null;
  expectedWorkspaceRevision: number | null;
  reusableHistoryAssetsByValue?: ReadonlyMap<string, AssetRef>;
}

interface VideoProjectWorkspaceCommitResult extends VideoProjectSaveResult {
  historyAssetsByValue: ReadonlyMap<string, AssetRef>;
}

/** Retain one prepared attempt across failures; retry never stages a second copy of its graph. */
export function createVideoProjectWorkspaceCommit(
  input: VideoProjectWorkspaceCommitInput
): () => Promise<VideoProjectWorkspaceCommitResult> {
  const owned = ownWorkspaceCommitInput(input);
  let publish: (() => Promise<VideoProjectWorkspaceCommitResult>) | undefined;
  let execution: Promise<VideoProjectWorkspaceCommitResult> | undefined;
  return () => {
    if (execution) return execution;
    execution = (async () => {
      publish ??= await prepareWorkspaceCommit(owned);
      return publish();
    })();
    void execution.catch(() => {
      execution = undefined;
    });
    return execution;
  };
}

function ownWorkspaceCommitInput(
  input: VideoProjectWorkspaceCommitInput
): VideoProjectWorkspaceCommitInput {
  return {
    ...input,
    project: structuredClone(input.project),
    expectedProject: structuredClone(input.expectedProject),
    history: { ...input.history, past: [...input.history.past], future: [...input.history.future] },
    reusableHistoryAssetsByValue: new Map(input.reusableHistoryAssetsByValue),
  };
}

/** Return a resumable publication only after immutable objects and its ready journal are accepted. */
export async function prepareVideoProjectWorkspaceCommit(
  input: VideoProjectWorkspaceCommitInput
): Promise<() => Promise<VideoProjectWorkspaceCommitResult>> {
  return prepareWorkspaceCommit(ownWorkspaceCommitInput(input));
}

async function prepareWorkspaceCommit(
  input: VideoProjectWorkspaceCommitInput
): Promise<() => Promise<VideoProjectWorkspaceCommitResult>> {
  // Cold admission precedes asset staging and its shared transition leases.
  const db = await initDB();
  if (
    (input.expectedProject === null) !== (input.expectedWorkspaceRevision === null) ||
    (input.expectedWorkspaceRevision !== null && !revision(input.expectedWorkspaceRevision)) ||
    !sameProjectBirth(input.project, input.expectedProject)
  )
    throw new Error('Video project workspace predecessor is invalid.');
  if (!isHydratableVideoProject(input.project)) throw new Error('Invalid video project payload');
  assertHistoryWireBudget(input);
  await verifyVideoProjectEffectSnapshotIntegrity(input.project);
  await recoverProjectMediaPublications();
  const { existing, retained: expectedRetainedRevision } = await readVideoProjectRevisionSnapshot(
    db,
    input.project.id
  );
  guardStaleVideoProjectSave({
    existing: existing ?? undefined,
    options: {
      expectedProject: input.expectedProject,
      expectedWorkspaceRevision: input.expectedWorkspaceRevision,
    },
    project: input.project,
    replacesHistory: true,
  });
  const prepared = await preparePersistedVideoProjectHistory(
    input.history,
    input.reusableHistoryAssetsByValue
  );
  try {
    const payload: PreparedVideoProjectWorkspaceWrite = {
      project: input.project,
      history: prepared.history,
      refs: prepared.refs,
      expectedProject: input.expectedProject,
      expectedWorkspaceRevision: input.expectedWorkspaceRevision,
      expectedRetainedRevision,
    };
    const journal = await createAssetPublicationJournal({
      domain: VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN,
      payload,
      assetRefs: prepared.objects.map(({ ref }) => ref),
    });
    let acknowledged: VideoProjectSaveResult | undefined;
    return async () => {
      await publishReadyJournalWithRetry(journal, async (ready, permit) => {
        const result = await commitPreparedVideoProjectWorkspace(payload, ready, permit);
        if (!acknowledged?.checkpointReceipt) acknowledged = result;
      });
      await releaseAssetReadyProtection(prepared.objects.map(({ ref }) => ref.assetId));
      if (!acknowledged) throw new Error('Video project publication produced no result.');
      return { ...acknowledged, historyAssetsByValue: prepared.assetsByValue };
    };
  } catch (error) {
    const failures = await collectPreparedAssetCleanupFailures(
      prepared.objects.map(({ ref }) => ref.assetId)
    );
    throwAssetPreparationError(error, failures, 'Video project save cleanup failed.');
  }
}

function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function assertHistoryWireBudget(input: VideoProjectWorkspaceCommitInput): void {
  const { past, future, recovery } = input.history;
  const envelopeBytes = new TextEncoder().encode(
    JSON.stringify({ version: 1, projectId: input.project.id, past: [], future: [] })
  ).byteLength;
  const branchBytes = [...past, ...future].reduce((total, entry) => total + entry.bytes, 0);
  const separators = Math.max(0, past.length - 1) + Math.max(0, future.length - 1);
  if (
    envelopeBytes + branchBytes + separators > EDITOR_HISTORY_LIMITS.maxBytes ||
    (recovery && envelopeBytes + recovery.bytes > EDITOR_HISTORY_LIMITS.maxBytes)
  )
    throw new Error('Video project history exceeds the checkpoint wire budget.');
}

function sameProjectBirth(project: VideoProject, previous: VideoProject | null): boolean {
  return (
    previous === null || (previous.id === project.id && previous.createdAt === project.createdAt)
  );
}

function parseWorkspacePublicationPayload(
  value: unknown
): PreparedVideoProjectWorkspaceWrite | null {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'project',
      'history',
      'refs',
      'expectedProject',
      'expectedWorkspaceRevision',
      'expectedRetainedRevision',
    ]) ||
    !isHydratableVideoProject(value['project']) ||
    !(value['expectedProject'] === null || isHydratableVideoProject(value['expectedProject'])) ||
    !revision(value['expectedRetainedRevision']) ||
    !(
      value['expectedWorkspaceRevision'] === null || revision(value['expectedWorkspaceRevision'])
    ) ||
    !Array.isArray(value['refs']) ||
    value['refs'].length > EDITOR_HISTORY_LIMITS.maxActions
  )
    return null;
  const project = value['project'];
  const expectedProject = value['expectedProject'];
  const expectedWorkspaceRevision = value['expectedWorkspaceRevision'];
  if (
    (expectedProject === null) !== (expectedWorkspaceRevision === null) ||
    !sameProjectBirth(project, expectedProject) ||
    (expectedWorkspaceRevision !== null &&
      expectedWorkspaceRevision > value['expectedRetainedRevision'])
  )
    return null;
  const history = parsePersistedVideoProjectHistory(value['history']);
  if (!history) return null;
  const needed = new Set(videoProjectHistoryAssetBindings(history).map(({ assetId }) => assetId));
  const refs = new Map<string, AssetRef>();
  for (const raw of value['refs']) {
    const ref = parseAssetRef(raw);
    if (
      !ref ||
      refs.has(ref.assetId) ||
      !needed.has(ref.assetId) ||
      ref.mimeType !== 'application/json' ||
      !ref.sha256 ||
      !isSha256Digest(`sha256:${ref.sha256}`)
    )
      return null;
    refs.set(ref.assetId, ref);
  }
  if (refs.size !== needed.size) return null;
  let bytes = 0;
  for (const entry of videoProjectHistoryChangeRefs(history)) {
    bytes += refs.get(entry.assetId)!.size;
    if (bytes > EDITOR_HISTORY_LIMITS.maxBytes) return null;
  }
  return {
    project,
    history,
    refs: [...refs.values()],
    expectedProject,
    expectedWorkspaceRevision,
    expectedRetainedRevision: value['expectedRetainedRevision'],
  };
}

function requireWorkspaceJournal(journal: AssetReadyJournal): PreparedVideoProjectWorkspaceWrite {
  if (
    journal.domain !== VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN ||
    journal.operationId !== undefined ||
    !journal.journalId ||
    journal.journalId.length > 200 ||
    journal.assetRefs.length > EDITOR_HISTORY_LIMITS.maxActions
  )
    throw new Error('Invalid video project workspace journal.');
  const input = parseWorkspacePublicationPayload(journal.payload);
  if (!input) throw new Error('Invalid video project workspace payload.');
  const refs = new Map(input.refs.map((ref) => [ref.assetId, ref]));
  const staged = new Set<string>();
  for (const raw of journal.assetRefs) {
    const ref = parseAssetRef(raw);
    if (
      !ref ||
      staged.has(ref.assetId) ||
      JSON.stringify(refs.get(ref.assetId)) !== JSON.stringify(ref)
    )
      throw new Error('Invalid video project workspace staged references.');
    staged.add(ref.assetId);
  }
  return input;
}

/** Cold replay admits unknown metadata and complete file contents before native publication. */
export const videoProjectWorkspacePublicationAdapter: AssetPublicationAdapter = {
  domain: VIDEO_PROJECT_WORKSPACE_PUBLICATION_DOMAIN,
  publish: async (journal, permit) => {
    const input = requireWorkspaceJournal(journal);
    const status = await readVideoProjectWorkspacePublicationStatus(input, journal.journalId);
    if (status === 'superseded') throw new SupersededAssetPublicationError();
    if (status === 'ready') {
      await verifyVideoProjectEffectSnapshotIntegrity(input.project);
      await hydratePersistedVideoProjectHistory({
        history: input.history,
        refs: input.refs,
        current: input.project,
      });
    }
    await commitPreparedVideoProjectWorkspace(input, journal, permit);
  },
};

/** Startup maintenance uses the same ready journal and native CAS as an owned warm attempt. */
export function recoverVideoProjectWorkspacePublications(): Promise<number> {
  return recoverStandaloneAssetPublications([videoProjectWorkspacePublicationAdapter]);
}
