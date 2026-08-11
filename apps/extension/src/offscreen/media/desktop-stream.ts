type DesktopStreamAcquireOptions = {
  controlledCursorCaptureEnabled?: boolean;
  desktopStreamId?: string;
};

export async function acquireDesktopStream(
  options: DesktopStreamAcquireOptions
): Promise<MediaStream> {
  if (options.desktopStreamId) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.desktopStreamId,
          maxFrameRate: 60,
        },
      } as MediaTrackConstraints,
    });
    if (options.controlledCursorCaptureEnabled) {
      try {
        await suppressDesktopCursor(stream);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        throw error;
      }
    }
    return stream;
  }

  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 60 },
      ...(options.controlledCursorCaptureEnabled ? { cursor: 'never' as const } : {}),
    },
    audio: false,
  });
}

async function suppressDesktopCursor(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) throw new Error('Cursor-free desktop capture is unavailable');
  await track.applyConstraints({ cursor: 'never' } as MediaTrackConstraints);
  const settings = track.getSettings() as MediaTrackSettings & { cursor?: string };
  if (settings.cursor !== 'never') {
    throw new Error('Chrome did not confirm cursor-free desktop capture');
  }
}
