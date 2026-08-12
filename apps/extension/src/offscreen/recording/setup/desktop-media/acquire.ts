import type { DesktopMediaRequestOptions } from './types';
import { acquireDesktopStream as acquireSharedDesktopStream } from '../../../media/desktop-stream';

const DESKTOP_STREAM_ACQUIRE_PHASE = 'desktop-stream-acquire' as const;
const DISPLAY_MEDIA_ACQUIRE_PHASE = 'display-media-acquire' as const;

export function isDesktopStreamAcquisitionRequest(options: DesktopMediaRequestOptions): boolean {
  return Boolean(options.desktopStreamId);
}

export function getDesktopMediaAcquirePhase(
  options: DesktopMediaRequestOptions
): typeof DESKTOP_STREAM_ACQUIRE_PHASE | typeof DISPLAY_MEDIA_ACQUIRE_PHASE {
  return options.desktopStreamId === undefined
    ? DISPLAY_MEDIA_ACQUIRE_PHASE
    : DESKTOP_STREAM_ACQUIRE_PHASE;
}

export async function acquireDesktopStream(
  options: DesktopMediaRequestOptions
): Promise<MediaStream> {
  return acquireSharedDesktopStream(options);
}
