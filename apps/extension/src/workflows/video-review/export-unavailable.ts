import type { QuickEditExportReason } from '../../features/video/review/advanced/effective';

/** Typed unavailability so the UI can show the exact reasons instead of a generic failure. */
export class QuickEditExportUnavailable extends Error {
  readonly reasons: readonly QuickEditExportReason[];
  constructor(reasons: readonly QuickEditExportReason[]) {
    super('Review export is unavailable.');
    this.name = 'QuickEditExportUnavailable';
    this.reasons = reasons;
  }
}
