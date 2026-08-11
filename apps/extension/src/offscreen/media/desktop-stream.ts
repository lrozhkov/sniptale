type DesktopStreamAcquireOptions = {
  controlledCursorCaptureEnabled?: boolean;
  desktopStreamId?: string;
};

export async function acquireDesktopStream(
  options: DesktopStreamAcquireOptions
): Promise<MediaStream> {
  if (options.desktopStreamId) {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.desktopStreamId,
          maxFrameRate: 60,
        },
        ...(options.controlledCursorCaptureEnabled ? { cursor: 'never' as const } : {}),
      } as MediaTrackConstraints,
    });
  }

  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 60 },
      ...(options.controlledCursorCaptureEnabled ? { cursor: 'never' as const } : {}),
    },
    audio: false,
  });
}
