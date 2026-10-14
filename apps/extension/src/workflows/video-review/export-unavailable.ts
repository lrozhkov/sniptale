import type { QuickEditExportReason } from '../../features/video/review/advanced/effective';
import type { ReviewCaptionConflict } from '../../features/video/review/caption-plan';
import type { QuickEditCameraConflict } from '../../features/video/review/advanced/scene';

/** Typed unavailability so the UI can show the exact reasons instead of a generic failure. */
export class QuickEditExportUnavailable extends Error {
  readonly reasons: readonly QuickEditExportReason[];
  readonly captionConflicts: readonly ReviewCaptionConflict[];
  readonly cameraConflicts: readonly QuickEditCameraConflict[];
  constructor(
    reasons: readonly QuickEditExportReason[],
    captionConflicts: readonly ReviewCaptionConflict[] = [],
    cameraConflicts: readonly QuickEditCameraConflict[] = []
  ) {
    super('Review export is unavailable.');
    this.name = 'QuickEditExportUnavailable';
    this.reasons = reasons;
    this.captionConflicts = structuredClone(captionConflicts);
    this.cameraConflicts = structuredClone(cameraConflicts);
  }
}
