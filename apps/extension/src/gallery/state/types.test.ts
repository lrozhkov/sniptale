import { expectTypeOf, it } from 'vitest';
import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
} from '../../workflows/media-hub-backup/index';
import type { GalleryAppState, PendingExportState } from './types';

it('keeps pending backup export state on the gallery app surface contract', () => {
  expectTypeOf<PendingExportState>().toEqualTypeOf<{
    options: MediaHubBackupExportOptions;
    summary: MediaHubLocalBackupSummary;
  }>();
  expectTypeOf<
    GalleryAppState['storage']['pendingExport']
  >().toEqualTypeOf<PendingExportState | null>();
});
