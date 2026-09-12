import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
} from '../../../composition/persistence/media-library';

export type GuideVideoSource = { blob: Blob; filename: string; recordingId: string | null };

/** Reads only the explicitly selected immutable source video; edited timelines are separate assets. */
export async function loadGuideVideoSource(
  input: File | { mediaId: string },
  signal: AbortSignal
): Promise<GuideVideoSource> {
  signal.throwIfAborted();
  if (input instanceof File) {
    if (!input.size || !input.type.startsWith('video/'))
      throw new Error('Unsupported video source.');
    return { blob: input, filename: input.name, recordingId: null };
  }
  const entry = await getMediaLibraryEntry(input.mediaId);
  if (!entry || entry.kind !== 'video' || entry.source.kind === 'web-snapshot')
    throw new Error('Video source unavailable.');
  signal.throwIfAborted();
  const blob = await getMediaAssetBlob(entry.id);
  const current = await getMediaLibraryEntry(entry.id);
  signal.throwIfAborted();
  if (
    !blob?.size ||
    !blob.type.startsWith('video/') ||
    !current ||
    current.updatedAt !== entry.updatedAt ||
    current.size !== entry.size ||
    JSON.stringify(current.source) !== JSON.stringify(entry.source)
  )
    throw new Error('Video source changed.');
  return {
    blob,
    filename: entry.filename,
    recordingId: entry.source.kind === 'recording' ? entry.source.recordingId : null,
  };
}

/** Captures currently decoded pixels synchronously, then encodes an independent bounded PNG. */
export async function captureGuideVideoFrame(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<{ blob: Blob; timeSeconds: number }> {
  signal.throwIfAborted();
  video.pause();
  if (
    video.seeking ||
    video.readyState < 2 ||
    video.error ||
    !video.videoWidth ||
    !video.videoHeight ||
    !Number.isFinite(video.currentTime) ||
    video.currentTime < 0
  )
    throw new Error('Video frame is not ready.');
  const source = video.currentSrc;
  const timeSeconds = video.currentTime;
  const ratio = Math.min(
    1,
    4096 / Math.max(video.videoWidth, video.videoHeight),
    Math.sqrt(16_000_000 / (video.videoWidth * video.videoHeight))
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(video.videoWidth * ratio));
  canvas.height = Math.max(1, Math.floor(video.videoHeight * ratio));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video frame renderer unavailable.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      canvas.toBlob((value) => {
        signal.removeEventListener('abort', abort);
        if (value) resolve(value);
        else reject(new Error('Video frame encoding failed.'));
      }, 'image/png');
    });
    signal.throwIfAborted();
    if (source !== video.currentSrc || timeSeconds !== video.currentTime || video.seeking)
      throw new Error('Video frame changed.');
    return { blob, timeSeconds };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
