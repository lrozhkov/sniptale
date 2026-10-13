import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';

/** Missing capability metadata is unknown coverage, never proof that no events happened. */
export function reviewHistoryCaptureStatus(
  capabilities: RecordingTelemetryCapabilities | null | undefined,
  family: 'keyboard' | 'mouse' | 'cursor'
): 'available' | 'unavailable' | 'unknown' {
  if (!capabilities) return 'unknown';
  if (family === 'keyboard') return capabilities.keyboard;
  if (family === 'cursor') return capabilities.pointer;
  if (capabilities.pointer === 'available' || capabilities.wheel === 'available')
    return 'available';
  return capabilities.pointer === 'unavailable' && capabilities.wheel === 'unavailable'
    ? 'unavailable'
    : 'unknown';
}

/** Shared status labels keep timeline and searchable history on the same capture contract. */
export function reviewHistoryCaptureLabel(status: ReturnType<typeof reviewHistoryCaptureStatus>) {
  return status === 'available'
    ? 'gallery.videoReview.historyCaptureEmpty'
    : status === 'unavailable'
      ? 'gallery.videoReview.historyCaptureUnavailable'
      : 'gallery.videoReview.historyCaptureUnknown';
}
