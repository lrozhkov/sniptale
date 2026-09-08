import type { ReviewExportReceipt } from '../../workflows/video-review/export-lifecycle';
import { translate } from '../../platform/i18n';
import { createVideoReviewReport } from '../../workflows/video-review/report';
import { downloadBlob } from '../library/actions/shared';
import type { LoadedReview } from './use-session';

/** Copy and download share the exact committed revision and complete telemetry payload. */
export async function exportReviewReport(
  resource: LoadedReview,
  action: 'copy' | 'download',
  exportReceipt?: ReviewExportReceipt
) {
  const report = createVideoReviewReport({
    snapshot: resource.session.getSnapshot().snapshot,
    filename: resource.filename,
    telemetry: resource.telemetry,
    ...(resource.provenance ? { provenance: resource.provenance } : {}),
    ...(exportReceipt ? { exportReceipt } : {}),
    labels: {
      title: translate('gallery.videoReview.reportTitle'),
      source: translate('gallery.videoReview.reportSource'),
      timeline: translate('gallery.videoReview.reportTimeline'),
      machineData: translate('gallery.videoReview.reportData'),
      comment: translate('gallery.videoReview.reportComment'),
      cut: translate('gallery.videoReview.reportCut'),
      speed: translate('gallery.videoReview.reportSpeed'),
      telemetry: translate('gallery.videoReview.reportTelemetry'),
      excluded: translate('gallery.videoReview.reportExcluded'),
      empty: translate('gallery.videoReview.reportEmpty'),
    },
  });
  if (action === 'copy') await navigator.clipboard.writeText(report);
  else
    downloadBlob(
      new Blob([report], { type: 'text/markdown;charset=utf-8' }),
      `${resource.filename}.sniptale-video-review.md`
    );
}
