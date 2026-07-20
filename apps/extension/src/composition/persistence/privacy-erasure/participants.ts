import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';
import type {
  BrowserStorageErasurePlan,
  ErasureParticipantResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';
import { createBrowserStorageParticipant } from './browser-storage-participant';
import { createExtensionPageLocalStorageParticipant } from './page-local-storage-participant';
import type { ExtensionPageLocalStorageErasureAdapter } from './page-local-storage-participant';
import type { ErasureParticipant } from './participant-types';
import { createParticipantResult } from './participant-result';
import {
  createVideoPreviewCacheParticipant,
  type VideoPreviewCacheErasureAdapter,
} from './video-preview-participant';

interface ErasureIndexedDbAdapter {
  countStores(storeNames: readonly string[]): Promise<number>;
  clearStores(storeNames: readonly string[]): Promise<void>;
}

export interface LocalExtensionDataErasureDeps {
  browserStorageAreas: {
    local: BrowserStorageAreaAdapter;
    session: BrowserStorageAreaAdapter;
    sync: BrowserStorageAreaAdapter;
  };
  editorBootstrapRetention: {
    erase(): Promise<void>;
    verifyEmpty(): Promise<boolean>;
  };
  indexedDb: ErasureIndexedDbAdapter;
  extensionPageLocalStorage?: ExtensionPageLocalStorageErasureAdapter;
  videoPreviewCache: VideoPreviewCacheErasureAdapter;
}

interface PersistentErasureParticipantExecution {
  failedRequiredParticipantIds: string[];
  participants: ErasureParticipantResult[];
  removedKeysByParticipantId: ReadonlyMap<string, readonly string[]>;
}

function describeErasureError(): string {
  return 'Local data erasure participant failed';
}

function createIndexedDbParticipant(args: {
  deps: LocalExtensionDataErasureDeps;
  storeNames: readonly string[];
}): ErasureParticipant {
  return {
    id: 'indexed-db:core',
    severity: 'required',
    async erase() {
      await args.deps.indexedDb.clearStores(args.storeNames);
      return createParticipantResult({
        id: 'indexed-db:core',
        removedCount: args.storeNames.length,
        severity: 'required',
        status: 'erased',
      });
    },
    async verifyEmpty() {
      const remainingCount = await args.deps.indexedDb.countStores(args.storeNames);
      return createParticipantResult({
        id: 'indexed-db:core',
        remainingCount,
        severity: 'required',
        status: remainingCount === 0 ? 'verified-empty' : 'failed',
      });
    },
  };
}

function createEditorBootstrapParticipant(deps: LocalExtensionDataErasureDeps): ErasureParticipant {
  return {
    id: 'indexed-db:editor-bootstrap',
    severity: 'required',
    async erase() {
      await deps.editorBootstrapRetention.erase();
      return createParticipantResult({
        id: 'indexed-db:editor-bootstrap',
        severity: 'required',
        status: 'erased',
      });
    },
    async verifyEmpty() {
      const verified = await deps.editorBootstrapRetention.verifyEmpty();
      return createParticipantResult({
        id: 'indexed-db:editor-bootstrap',
        remainingCount: verified ? 0 : 1,
        severity: 'required',
        status: verified ? 'verified-empty' : 'failed',
      });
    },
  };
}

function buildErasureParticipants(
  plan: BrowserStorageErasurePlan,
  deps: LocalExtensionDataErasureDeps,
  storeNames: readonly string[],
  options: { preservePreferences: boolean }
): ErasureParticipant[] {
  return [
    createIndexedDbParticipant({ deps, storeNames }),
    createEditorBootstrapParticipant(deps),
    createVideoPreviewCacheParticipant(deps.videoPreviewCache),
    ...(deps.extensionPageLocalStorage
      ? [createExtensionPageLocalStorageParticipant(deps.extensionPageLocalStorage, options)]
      : []),
    createBrowserStorageParticipant({
      area: deps.browserStorageAreas.local,
      id: 'browser-storage:local',
      keys: plan.local,
      prefixes: plan.localPrefixes,
      severity: 'required',
    }),
    createBrowserStorageParticipant({
      area: deps.browserStorageAreas.session,
      id: 'browser-storage:session',
      keys: plan.session,
      prefixes: plan.sessionPrefixes,
      severity: 'required',
    }),
    createBrowserStorageParticipant({
      area: deps.browserStorageAreas.sync,
      id: 'browser-storage:sync',
      keys: plan.sync,
      prefixes: plan.syncPrefixes,
      severity:
        plan.sync.length === 0 && plan.syncPrefixes.length === 0 ? 'best-effort' : 'required',
    }),
  ];
}

async function executeErasureParticipant(
  participant: ErasureParticipant
): Promise<ErasureParticipantResult> {
  let eraseResult: ErasureParticipantResult;
  try {
    eraseResult = await participant.erase();
  } catch {
    return createParticipantResult({
      error: describeErasureError(),
      id: participant.id,
      severity: participant.severity,
      status: participant.severity === 'best-effort' ? 'skipped' : 'failed',
    });
  }

  try {
    const verifyResult = await participant.verifyEmpty();
    return {
      ...verifyResult,
      ...(eraseResult.removedCount === undefined ? {} : { removedCount: eraseResult.removedCount }),
    };
  } catch {
    return createParticipantResult({
      error: describeErasureError(),
      id: participant.id,
      ...(eraseResult.removedCount === undefined ? {} : { removedCount: eraseResult.removedCount }),
      severity: participant.severity,
      status: participant.severity === 'best-effort' ? 'skipped' : 'failed',
    });
  }
}

async function executeErasureParticipants(
  participants: readonly ErasureParticipant[]
): Promise<ErasureParticipantResult[]> {
  const results: ErasureParticipantResult[] = [];
  for (const participant of participants) {
    results.push(await executeErasureParticipant(participant));
  }
  return results;
}

async function runFinalParticipantVerification(
  participant: ErasureParticipant,
  previous: ErasureParticipantResult
): Promise<ErasureParticipantResult> {
  try {
    const verified = await participant.verifyEmpty();
    if (previous.status !== 'verified-empty') {
      return previous;
    }
    return {
      ...verified,
      ...(previous.removedCount === undefined ? {} : { removedCount: previous.removedCount }),
    };
  } catch {
    return previous.status === 'verified-empty'
      ? createParticipantResult({
          error: describeErasureError(),
          id: participant.id,
          ...(previous.removedCount === undefined ? {} : { removedCount: previous.removedCount }),
          severity: participant.severity,
          status: participant.severity === 'best-effort' ? 'skipped' : 'failed',
        })
      : previous;
  }
}

async function verifyParticipantsAgain(
  participants: readonly ErasureParticipant[],
  initialResults: readonly ErasureParticipantResult[]
): Promise<ErasureParticipantResult[]> {
  const finalResults: ErasureParticipantResult[] = [];
  for (const [index, participant] of participants.entries()) {
    finalResults.push(await runFinalParticipantVerification(participant, initialResults[index]!));
  }
  return finalResults;
}

function getFailedRequiredParticipantIds(results: readonly ErasureParticipantResult[]): string[] {
  return results
    .filter((result) => result.severity === 'required' && result.status !== 'verified-empty')
    .map((result) => result.id);
}

export async function executePersistentErasureParticipants(
  plan: BrowserStorageErasurePlan,
  deps: LocalExtensionDataErasureDeps,
  storeNames: readonly string[],
  options: { preservePreferences: boolean }
): Promise<PersistentErasureParticipantExecution> {
  const erasureParticipants = buildErasureParticipants(plan, deps, storeNames, options);
  const initialResults = await executeErasureParticipants(erasureParticipants);
  const participants = await verifyParticipantsAgain(erasureParticipants, initialResults);
  const removedKeysByParticipantId = new Map(
    erasureParticipants.map((participant) => [
      participant.id,
      [...(participant.getRemovedKeys?.() ?? [])],
    ])
  );

  return {
    failedRequiredParticipantIds: getFailedRequiredParticipantIds(participants),
    participants,
    removedKeysByParticipantId,
  };
}
