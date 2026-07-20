import type { DesktopMediaRequestOptions } from './types';

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
  if (options.desktopStreamId) {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.desktopStreamId,
          maxFrameRate: 30,
        },
      } as MediaTrackConstraints,
    });
  }

  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30 },
      ...(options.controlledCursorCaptureEnabled ? { cursor: 'never' as const } : {}),
    },
    audio: false,
  });
}
