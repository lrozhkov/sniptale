import {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
  type TabOutputGeometry,
} from '../geometry/tab-source';
import { applyVideoTrackContentHint } from '../../../platform/media-utils/video-recording';
import { resolveFixedVideoFrameRate } from './frame-pump';
import type { LiveVideoFrameTransform } from '../encoding/live-artifact-session';

export {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
};
export type { TabOutputGeometry };

type TabOutputStream = {
  frameRate: number;
  frameTransform?: LiveVideoFrameTransform;
  stream: MediaStream;
};

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

export async function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  options: { frameRate?: number } = {}
): Promise<TabOutputStream> {
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
  resolveFixedVideoFrameRate(requestedFrameRate, sourceFrameRate);
  applyVideoTrackContentHint(sourceTrack, 'detail');
  return {
    frameRate: requestedFrameRate,
    frameTransform: {
      fit: geometry.fillsOutput ? 'fill' : 'contain',
      outputSize: geometry.outputSize,
      sourceRect: geometry.sourceRect,
    },
    stream: sourceStream,
  };
}
