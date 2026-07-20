import { privacyErasureBrowserStorage } from '../infrastructure/browser-storage/privacy-erasure';
import { runWithPersistentDataErasureBarrier } from '../infrastructure/mutation-barrier';
import {
  eraseSniptaleDatabaseForPrivacyErasure,
  verifySniptaleDatabaseAbsentAfterPrivacyErasure,
} from '../infrastructure/indexed-db/core';
import {
  eraseEditorBootstrapRetentionData,
  verifyEditorBootstrapRetentionEmpty,
} from '../editor-bootstrap/retention';
import {
  buildBrowserStorageErasurePlan,
  getIndexedDbStoresForLocalExtensionDataErasure,
} from './inventory';
import type {
  LocalExtensionDataErasureOptions,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';
import {
  executePersistentErasureParticipants,
  type LocalExtensionDataErasureDeps,
} from './participants';
import type { ExtensionPageLocalStorageErasureAdapter } from './page-local-storage-participant';
import {
  eraseVideoPreviewCacheForPrivacyErasure,
  verifyVideoPreviewCacheEmptyAfterPrivacyErasure,
} from '../video-preview-cache/privacy-erasure';

async function clearIndexedDbStores(storeNames: readonly string[]): Promise<void> {
  void storeNames;
  await eraseSniptaleDatabaseForPrivacyErasure();
}

async function countIndexedDbStores(storeNames: readonly string[]): Promise<number> {
  void storeNames;
  return (await verifySniptaleDatabaseAbsentAfterPrivacyErasure()) ? 0 : 1;
}

const defaultErasureDeps: LocalExtensionDataErasureDeps = {
  browserStorageAreas: {
    local: privacyErasureBrowserStorage.local,
    session: privacyErasureBrowserStorage.session,
    sync: privacyErasureBrowserStorage.sync,
  },
  editorBootstrapRetention: {
    erase: eraseEditorBootstrapRetentionData,
    verifyEmpty: verifyEditorBootstrapRetentionEmpty,
  },
  indexedDb: {
    countStores: countIndexedDbStores,
    clearStores: clearIndexedDbStores,
  },
  videoPreviewCache: {
    erase: eraseVideoPreviewCacheForPrivacyErasure,
    verifyEmpty: verifyVideoPreviewCacheEmptyAfterPrivacyErasure,
  },
};

function getRemovedKeys(
  removedKeysByParticipantId: ReadonlyMap<string, readonly string[]>,
  participantId: string
): string[] {
  return [...removedKeysByParticipantId.get(participantId)!];
}

export async function erasePersistentLocalExtensionData(
  options: LocalExtensionDataErasureOptions,
  deps: LocalExtensionDataErasureDeps = defaultErasureDeps
): Promise<LocalExtensionDataErasureResult> {
  const pageLocalStorage = deps.extensionPageLocalStorage;
  try {
    await pageLocalStorage?.prepare();
    return await runWithPersistentDataErasureBarrier(async () => {
      const storeNames = getIndexedDbStoresForLocalExtensionDataErasure();
      const plan = buildBrowserStorageErasurePlan(options);
      const { failedRequiredParticipantIds, participants, removedKeysByParticipantId } =
        await executePersistentErasureParticipants(plan, deps, storeNames, {
          preservePreferences: options.preservePreferences,
        });

      return {
        failedRequiredParticipantIds,
        indexedDbStoresCleared: storeNames.length,
        localStorageKeysRemoved: getRemovedKeys(
          removedKeysByParticipantId,
          'browser-storage:local'
        ),
        participants,
        success: failedRequiredParticipantIds.length === 0,
        sessionStorageKeysRemoved: getRemovedKeys(
          removedKeysByParticipantId,
          'browser-storage:session'
        ),
        syncStorageKeysRemoved: getRemovedKeys(removedKeysByParticipantId, 'browser-storage:sync'),
      };
    });
  } finally {
    await pageLocalStorage?.release();
  }
}

export function createPrivacyErasureStorageCleanupAdapter(
  extensionPageLocalStorage: ExtensionPageLocalStorageErasureAdapter
) {
  return {
    cleanup: (options: LocalExtensionDataErasureOptions) =>
      erasePersistentLocalExtensionData(options, {
        ...defaultErasureDeps,
        extensionPageLocalStorage,
      }),
  };
}
