import { VideoSample } from 'mediabunny';

/** Takes ownership of a decoded sample and transfers a drawable sample to its caller. */
export async function prepareDecodedVideoSample(
  sample: VideoSample,
  signal: AbortSignal,
  colorSpace?: VideoColorSpaceInit
): Promise<VideoSample> {
  let frame: VideoFrame | undefined;
  let packed: VideoFrame | undefined;
  try {
    signal.throwIfAborted();
    if (sample.format !== 'NV12' && !colorSpace) return sample;
    frame = sample.toVideoFrame();
    const visible = frame.visibleRect;
    if (!visible || !frame.format) {
      if (!colorSpace) return sample;
      throw new Error('Decoded frame planes are unavailable.');
    }
    if (
      !colorSpace &&
      visible.x === 0 &&
      visible.y === 0 &&
      visible.width === frame.codedWidth &&
      visible.height === frame.codedHeight
    )
      return sample;
    // Windows GPU NV12 conversion can read chroma outside visibleRect even at 1:1.
    // Copy native visible planes before conversion; a canvas/bitmap copy is already contaminated.
    const bytes = new Uint8Array(frame.allocationSize());
    const layout = await frame.copyTo(bytes);
    signal.throwIfAborted();
    packed = new VideoFrame(bytes, {
      format: frame.format,
      layout,
      codedWidth: visible.width,
      codedHeight: visible.height,
      displayWidth: frame.displayWidth,
      displayHeight: frame.displayHeight,
      colorSpace: colorSpace
        ? {
            primaries: frame.colorSpace.primaries,
            transfer: frame.colorSpace.transfer,
            matrix: frame.colorSpace.matrix,
            fullRange: frame.colorSpace.fullRange,
            ...colorSpace,
          }
        : frame.colorSpace,
      timestamp: frame.timestamp,
    });
    const prepared = new VideoSample(packed, {
      timestamp: sample.timestamp,
      duration: sample.duration,
      rotation: sample.rotation,
    });
    packed = undefined;
    sample.close();
    return prepared;
  } catch (error) {
    sample.close();
    throw error;
  } finally {
    packed?.close();
    frame?.close();
  }
}
