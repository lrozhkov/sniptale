import {
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../../storage/constants';
import type { PreparedBackupImportAsset } from '../prepare';
import type { getStore } from '../../storage';

type BackupTransaction = Parameters<typeof getStore>[0] & {
  abort(): void;
  done: Promise<unknown>;
};

export function getImportTransactionStoreNames(): string[] {
  return [
    STORE_NAME,
    RECORDING_TELEMETRY_STORE,
    PROJECT_ASSETS_STORE,
    PROJECT_EXPORTS_STORE,
    VIDEO_PROJECTS_STORE,
    VIDEO_EFFECT_BUNDLES_STORE,
    SCENARIO_PROJECTS_STORE,
    SCENARIO_ASSETS_STORE,
    SCENARIO_EXPORTS_STORE,
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    WEB_SNAPSHOTS_STORE,
    MEDIA_LIBRARY_STORE,
    THUMBNAILS_STORE,
  ];
}

export function assertBackupImportWritePreflightComplete(
  preparedAssets: PreparedBackupImportAsset[]
): void {
  for (const prepared of preparedAssets) {
    if (!prepared.assetBlob || !prepared.nextEntry) {
      throw new Error('Backup import write preflight is incomplete.');
    }
  }
}

export async function commitBackupTransaction<T>(
  tx: BackupTransaction,
  write: () => Promise<T>
): Promise<T> {
  try {
    const result = await write();
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The original failure remains authoritative when IndexedDB already ended the transaction.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
