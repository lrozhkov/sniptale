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

export {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
};
export type { TabOutputGeometry };

function canPassThroughSource(sourceStream: MediaStream, geometry: TabOutputGeometry): boolean {
  const [track] = sourceStream.getVideoTracks();
  if (
    !track ||
    !geometry.tracksFullViewport ||
    geometry.resolution !== 'SOURCE' ||
    geometry.outputSize.width !== geometry.outputBasis.width ||
    geometry.outputSize.height !== geometry.outputBasis.height
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

function canCropAtEncoderInput(geometry: TabOutputGeometry): boolean {
  const { sourceRect, sourceSize, outputSize } = geometry;
  return (
    geometry.tracksFullViewport &&
    geometry.resolution === 'SOURCE' &&
    geometry.outputBasis.width === sourceSize.width &&
    geometry.outputBasis.height === sourceSize.height &&
    sourceRect.x === 0 &&
    sourceRect.y === 0 &&
    sourceRect.width === outputSize.width &&
    sourceRect.height === outputSize.height &&
    sourceRect.width <= sourceSize.width &&
    sourceRect.height <= sourceSize.height &&
    sourceSize.width - sourceRect.width <= 1 &&
    sourceSize.height - sourceRect.height <= 1
  );
}

export async function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  options: { frameRate?: number } = {}
): Promise<CropOutputStream> {
  const [sourceTrack] = sourceStream.getVideoTracks();
  if (!sourceTrack) throw new Error('Tab source stream returned no video track');
  const sourceFrameRate = sourceTrack.getSettings().frameRate;
  const requestedFrameRate = options.frameRate ?? sourceFrameRate ?? 30;
  if (canPassThroughSource(sourceStream, geometry)) {
    applyVideoTrackContentHint(sourceTrack, 'detail');
    return {
      frameRate: requestedFrameRate,
      stream: sourceStream,
    };
  }
  if (canCropAtEncoderInput(geometry)) {
    applyVideoTrackContentHint(sourceTrack, 'detail');
    return {
      encoderFrameCrop: geometry.sourceRect,
      frameRate: requestedFrameRate,
      stream: sourceStream,
    };
  }
  resolveFixedVideoFrameRate(requestedFrameRate, sourceFrameRate);
  return createCropOutputStream(sourceStream, geometry, options);
}
