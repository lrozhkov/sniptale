import { createMaintenanceLog } from '../../composition/persistence/library-lifecycle/maintenance-log';
import { deleteMediaLibraryAsset } from '../../composition/persistence/media-library/index.library.ts';

const maintenanceLog = createMaintenanceLog();

/** Collect a released original when the native retention checks can prove it is unused. */
export async function tryCollectProjectOriginal(id: string): Promise<void> {
  try {
    await deleteMediaLibraryAsset(id, { projectRetainedOnly: true });
  } catch {
    void maintenanceLog.append({ operation: 'trash', code: 'conflict', counts: { retained: 1 } });
  }
}
