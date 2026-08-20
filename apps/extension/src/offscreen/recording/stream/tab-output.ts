import {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
  type TabOutputGeometry,
} from '../geometry/tab-source';
import { createCropOutputStream, type CropOutputStream } from './crop-stream';
import { applyVideoTrackContentHint } from '../../../platform/media-utils/video-recording';
import { resolveFixedVideoFrameRate } from './frame-pump';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';

export {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
};
export type { TabOutputGeometry };

function canPassThroughSource(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  requestedFrameRate: number | undefined
): boolean {
  const [track] = sourceStream.getVideoTracks();
  if (
    !track ||
    !geometry.tracksFullViewport ||
    geometry.resolution !== VideoResolutionPreset.SOURCE
  ) {
    return false;
  }
  const sourceFrameRate = track.getSettings().frameRate;
  if (
    requestedFrameRate !== undefined &&
    (typeof sourceFrameRate !== 'number' ||
      !Number.isFinite(sourceFrameRate) ||
      sourceFrameRate <= 0 ||
      sourceFrameRate > requestedFrameRate)
  ) {
    return false;
  }
  const { sourceRect, sourceSize, outputSize } = geometry;
  return (
    sourceRect.x === 0 &&
    sourceRect.y === 0 &&
    sourceRect.width === sourceSize.width &&
    sourceRect.height === sourceSize.height &&
    outputSize.width === sourceSize.width &&
    outputSize.height === sourceSize.height
  );
}

export async function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  options: { frameRate?: number } = {}
): Promise<CropOutputStream> {
  if (canPassThroughSource(sourceStream, geometry, options.frameRate)) {
    const [track] = sourceStream.getVideoTracks();
    if (!track) throw new Error('Tab source stream returned no video track');
    applyVideoTrackContentHint(track, 'detail');
    const sourceFrameRate = track.getSettings().frameRate;
    return {
      frameRate: resolveFixedVideoFrameRate(
        options.frameRate ?? sourceFrameRate ?? 30,
        sourceFrameRate
      ),
      stream: sourceStream,
    };
  }
  return createCropOutputStream(sourceStream, geometry, options);
}
