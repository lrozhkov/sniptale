import type { OffscreenMediaActivityLease } from './lease';
import { acquireOffscreenMediaActivityLease } from './lease';

let activeVideoRecordingLease: OffscreenMediaActivityLease | null = null;

export function acquireVideoRecordingMediaActivityLease() {
  releaseVideoRecordingMediaActivityLease();
  const acquisition = acquireOffscreenMediaActivityLease('video-recording');
  if (acquisition.acquired) activeVideoRecordingLease = acquisition.lease;
  return acquisition;
}

export function releaseVideoRecordingMediaActivityLease(): void {
  activeVideoRecordingLease?.release();
  activeVideoRecordingLease = null;
}
