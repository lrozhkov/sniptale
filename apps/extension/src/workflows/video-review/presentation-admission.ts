import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import type { ReviewSource } from '../../features/video/review/types';

type Failure =
  | 'size'
  | 'tracks'
  | 'dimensions'
  | 'duration'
  | 'video-decoder'
  | 'audio-decoder'
  | 'trim'
  | 'decode';
/** Stable categories are localized by the acquisition UI, without logging source contents. */
export class ReviewPresentationAdmissionError extends Error {
  constructor(public readonly code: Failure) {
    super(`presentation-media:${code}`);
    this.name = 'ReviewPresentationAdmissionError';
  }
}

/** Bounded admission precedes private publication; muted video need not decode its audio. */
export async function inspectReviewPresentationVideo(
  file: Blob,
  signal: AbortSignal,
  options: { muted?: boolean; trim?: { start: number; end: number } } = {}
): Promise<{ source: ReviewSource; hasAudio: boolean }> {
  signal.throwIfAborted();
  if (file.size < 1 || file.size > 512 * 1024 * 1024)
    throw new ReviewPresentationAdmissionError('size');
  const admissionSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    input.dispose();
    rejectAbort?.(admissionSignal.reason);
  };
  admissionSignal.addEventListener('abort', abort, { once: true });
  try {
    admissionSignal.throwIfAborted();
    return await Promise.race([inspect(input, file.size, admissionSignal, options), aborted]);
  } catch (error) {
    admissionSignal.throwIfAborted();
    throw error instanceof ReviewPresentationAdmissionError
      ? error
      : new ReviewPresentationAdmissionError('decode');
  } finally {
    admissionSignal.removeEventListener('abort', abort);
    input.dispose();
  }
}

async function inspect(
  input: Input,
  size: number,
  signal: AbortSignal,
  options: { muted?: boolean; trim?: { start: number; end: number } }
): Promise<{ source: ReviewSource; hasAudio: boolean }> {
  const videos = await input.getVideoTracks();
  const audios = await input.getAudioTracks();
  signal.throwIfAborted();
  const video = videos[0];
  if (videos.length !== 1 || !video || audios.length > 1)
    throw new ReviewPresentationAdmissionError('tracks');
  const width = await video.getDisplayWidth();
  const height = await video.getDisplayHeight();
  if (
    ![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 16384) ||
    width * height > 40_000_000
  )
    throw new ReviewPresentationAdmissionError('dimensions');
  const duration = await video.computeDuration();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
    throw new ReviewPresentationAdmissionError('duration');
  if (!(await video.canDecode())) throw new ReviewPresentationAdmissionError('video-decoder');
  if (!options.muted && audios[0]) {
    const audio = audios[0];
    const channels = await audio.getNumberOfChannels();
    const rate = await audio.getSampleRate();
    if (
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 8 ||
      !Number.isFinite(rate) ||
      rate < 8000 ||
      rate > 192000 ||
      !(await audio.canDecode())
    )
      throw new ReviewPresentationAdmissionError('audio-decoder');
  }
  const trim = options.trim ?? { start: 0, end: duration };
  const resolution = await video.getTimeResolution();
  if (
    !Number.isFinite(trim.start) ||
    !Number.isFinite(trim.end) ||
    trim.start < 0 ||
    trim.end > duration ||
    trim.end <= trim.start ||
    !Number.isFinite(resolution) ||
    resolution <= 0
  )
    throw new ReviewPresentationAdmissionError('trim');
  const last = (Math.ceil(trim.end * resolution) - 1) / resolution;
  if (last < trim.start) throw new ReviewPresentationAdmissionError('trim');
  const sink = new VideoSampleSink(video);
  for (const time of [trim.start, last]) {
    signal.throwIfAborted();
    const sample = await sink.getSample(time);
    try {
      signal.throwIfAborted();
      if (
        !sample ||
        !Number.isFinite(sample.timestamp) ||
        !Number.isFinite(sample.duration) ||
        sample.duration <= 0 ||
        sample.timestamp > time ||
        sample.timestamp + sample.duration <= time ||
        sample.displayWidth !== width ||
        sample.displayHeight !== height
      )
        throw new ReviewPresentationAdmissionError('decode');
    } finally {
      sample?.close();
    }
  }
  signal.throwIfAborted();
  const format = await input.getFormat();
  return {
    source: { width, height, duration, size, mimeType: format.mimeType },
    hasAudio: audios.length === 1,
  };
}
