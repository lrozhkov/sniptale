import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { EditorSessionAutosaveService } from '../session-autosave';

/** Complete the local save and request early publication of its exact pending checkpoint. */
export async function flushEditorDocumentForExit(
  autosave: Pick<EditorSessionAutosaveService, 'flushAutosave' | 'prepareCheckpointExit'>,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!autosave.prepareCheckpointExit) {
    await autosave.flushAutosave(getDocument);
    return;
  }
  const exit = await autosave.prepareCheckpointExit(getDocument);
  // A disabled-autosave discard can intentionally have no saved checkpoint.
  if (!exit.receipt) return;
  if (!exit.isCurrent()) throw new Error('Editor document changed during exit.');
  try {
    await createSyncProductClient().requestCheckpointExit(exit.receipt);
  } catch {
    // The durable interval remains the recovery path when advisory delivery fails.
  }
  if (!exit.isCurrent()) throw new Error('Editor document changed during exit.');
}
