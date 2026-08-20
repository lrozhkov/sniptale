import { IMAGE_WORKSPACES_STORE, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE } from '../core.stores.ts';
import type { UpgradeTransaction } from './types';

export async function applyEditorDocumentsV29Upgrade(
  oldVersion: number,
  transaction?: UpgradeTransaction
): Promise<void> {
  if (oldVersion >= 29 || oldVersion === 0) return;
  if (!transaction) throw new Error('Editor document upgrade transaction is unavailable.');
  await Promise.all([
    transaction.objectStore(IMAGE_WORKSPACES_STORE).clear(),
    transaction.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).clear(),
  ]);
}
