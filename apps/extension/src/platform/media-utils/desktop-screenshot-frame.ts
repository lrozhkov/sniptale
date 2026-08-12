import type { ScreenshotImageFormat } from '@sniptale/runtime-contracts/capture/action';
import { captureDesktopStreamFrame } from './desktop-frame';

async function suppressCursor(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) return;
  await track.applyConstraints({ cursor: 'never' } as MediaTrackConstraints).catch(() => undefined);
}

async function acquireStream(streamId: string): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId,
        maxFrameRate: 60,
      },
    } as MediaTrackConstraints,
  });
  await suppressCursor(stream);
  return stream;
}

export async function captureDesktopScreenshotFrame(args: {
  streamId: string;
  imageFormat: ScreenshotImageFormat;
  imageQuality: number;
}): Promise<{ dataUrl: string; width: number; height: number }> {
  return captureDesktopStreamFrame({
    acquireStream: () => acquireStream(args.streamId),
    imageFormat: args.imageFormat,
    imageQuality: args.imageQuality,
  });
}
