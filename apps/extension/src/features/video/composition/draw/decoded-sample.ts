import { VideoSample } from 'mediabunny';

/** Takes ownership of a native frame and packs padded NV12 visible planes before canvas conversion. */
export async function prepareDecodedVideoFrame(
  frame: VideoFrame,
  signal: AbortSignal,
  colorSpace?: VideoColorSpaceInit
): Promise<VideoFrame> {
  try {
    signal.throwIfAborted();
    if (frame.format !== 'NV12' && !colorSpace) return frame;
    const visible = frame.visibleRect;
    if (!visible || !frame.format) {
      if (!colorSpace) return frame;
      throw new Error('Decoded frame planes are unavailable.');
    }
    if (
      !colorSpace &&
      visible.x === 0 &&
      visible.y === 0 &&
      visible.width === frame.codedWidth &&
      visible.height === frame.codedHeight
    )
      return frame;
    // Windows GPU NV12 conversion can read chroma outside visibleRect even at 1:1.
    // Copy native visible planes before conversion; a canvas/bitmap copy is already contaminated.
    const bytes = new Uint8Array(frame.allocationSize());
    const layout = await frame.copyTo(bytes);
    signal.throwIfAborted();
    const packed = new VideoFrame(bytes, {
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
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return packed;
  } catch (error) {
    frame.close();
    throw error;
  }
}

/** Takes ownership of a decoded sample and transfers a drawable sample to its caller. */
export async function prepareDecodedVideoSample(
  sample: VideoSample,
  signal: AbortSignal,
  colorSpace?: VideoColorSpaceInit
): Promise<VideoSample> {
  let frame: VideoFrame | undefined;
  try {
    signal.throwIfAborted();
    if (sample.format !== 'NV12' && !colorSpace) return sample;
    frame = await prepareDecodedVideoFrame(sample.toVideoFrame(), signal, colorSpace);
    const prepared = new VideoSample(frame, {
      timestamp: sample.timestamp,
      duration: sample.duration,
      rotation: sample.rotation,
      flip: sample.flip,
    });
    frame = undefined;
    sample.close();
    return prepared;
  } catch (error) {
    sample.close();
    throw error;
  } finally {
    frame?.close();
  }
}
