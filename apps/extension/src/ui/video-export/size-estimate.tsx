import { useAppLocale } from '../../platform/i18n/locale/hook';
import { translate } from '../../platform/i18n';
import { formatBytes } from '../../platform/i18n/format-bytes';
import type { VideoExportSizeStatus } from './use-size-estimate';

/** Advisory estimate stays separate from export admission and never promises an exact file size. */
export function VideoExportSizeHint({ status }: { status: VideoExportSizeStatus | null }) {
  useAppLocale();
  if (!status) return null;
  return (
    <div
      className="min-w-0 space-y-1 whitespace-normal break-words text-xs text-[var(--sniptale-color-text-muted)]"
      data-ui="video.exportSizeEstimate"
    >
      <p role="status" aria-live="polite">
        {status.kind === 'pending'
          ? translate('videoEditor.exportDialog.sizeEstimating')
          : status.kind === 'unavailable'
            ? translate('videoEditor.exportDialog.sizeUnavailable')
            : `${translate('videoEditor.exportDialog.estimatedSize')} ≈ ${formatBytes(status.estimate.bytes, 0)}`}
      </p>
      {status.kind === 'ready' ? (
        <p className="text-[11px] leading-relaxed">
          {translate('videoEditor.exportDialog.sizeEstimateHint')}
        </p>
      ) : null}
    </div>
  );
}
