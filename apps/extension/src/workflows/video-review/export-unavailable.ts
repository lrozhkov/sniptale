import type { QuickEditExportReason } from '../../features/video/review/advanced/effective';
import type { ReviewCaptionConflict } from '../../features/video/review/caption-plan';

/** Typed unavailability so the UI can show the exact reasons instead of a generic failure. */
export class QuickEditExportUnavailable extends Error {
  readonly reasons: readonly QuickEditExportReason[];
  readonly captionConflicts: readonly ReviewCaptionConflict[];
  constructor(
    reasons: readonly QuickEditExportReason[],
    captionConflicts: readonly ReviewCaptionConflict[] = []
  ) {
    super('Review export is unavailable.');
    this.name = 'QuickEditExportUnavailable';
    this.reasons = reasons;
    this.captionConflicts = structuredClone(captionConflicts);
  }
}
