import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { isRecordingSafeSize, resolveRecordingSafeSize } from '../dimensions';
import { detectRightEdgePadding } from '../edge-padding';
import { applyCanvasCrop } from './viewport';
import { createRecordingVideoElement, waitForVideoReady } from './viewport/video';

function releaseRecordingVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
}

export async function normalizeRecordingStreamDimensions(
  sourceStream: MediaStream,
  quality: VideoQuality
): Promise<MediaStream> {
  const video = createRecordingVideoElement(sourceStream);
  await waitForVideoReady(video, 'Recording stream video ready timeout', 'Video load error');

  const sourceSize = { width: video.videoWidth, height: video.videoHeight };
  const rightEdgePadding = detectRightEdgePadding(video);
  releaseRecordingVideoElement(video);

  if (sourceSize.width <= 0 || sourceSize.height <= 0) {
    return sourceStream;
  }

  if (rightEdgePadding === 0 && isRecordingSafeSize(sourceSize)) {
    return sourceStream;
  }

  const safeSize = resolveRecordingSafeSize({
    height: sourceSize.height,
    width: sourceSize.width - rightEdgePadding,
  });
  return applyCanvasCrop(
    sourceStream,
    { x: 0, y: 0, width: safeSize.width, height: safeSize.height },
    quality
  );
}
