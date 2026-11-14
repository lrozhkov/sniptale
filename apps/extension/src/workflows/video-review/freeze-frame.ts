import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

/** Reads only original decoded frame timing. No preview pixels or encoded copy become project data. */
export async function readReviewFreezeFrame(
  file: Blob,
  time: number,
  duration: number,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  if (!Number.isFinite(time) || time < 0 || time > duration)
    throw new Error('Invalid freeze position.');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    signal.throwIfAborted();
    if (!track || !(await track.canDecode())) throw new Error('Freeze source cannot be decoded.');
    const first = await track.getFirstTimestamp();
    signal.throwIfAborted();
    const sample = await new VideoSampleSink(track).getSample(Math.max(time, first));
    if (!sample) throw new Error('Freeze source frame is unavailable.');
    try {
      signal.throwIfAborted();
      if (
        !Number.isFinite(sample.timestamp) ||
        sample.timestamp < 0 ||
        sample.timestamp >= duration ||
        !Number.isFinite(sample.duration) ||
        sample.duration <= 0 ||
        (time !== 0 && sample.timestamp > time) ||
        sample.timestamp + sample.duration < time - 1e-6
      )
        throw new Error('Freeze source frame has no valid interval.');
      return { frameTime: sample.timestamp, frameDuration: sample.duration };
    } finally {
      sample.close();
    }
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}
