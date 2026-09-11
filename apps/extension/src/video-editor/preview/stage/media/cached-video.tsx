import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { createVideoPreviewCacheMediaType } from '../../../../composition/persistence/video-preview-cache';
import type { PreparedCachedVideoPreview } from '../../cache/types';
import { shouldRefreshPausedPreviewMediaTime } from './sync';

function appendSourceBuffer(sourceBuffer: SourceBuffer, bytes: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener('error', handleError);
      sourceBuffer.removeEventListener('updateend', handleUpdateEnd);
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Cached preview segment could not be appended'));
    };
    const handleUpdateEnd = () => {
      cleanup();
      resolve();
    };
    sourceBuffer.addEventListener('error', handleError, { once: true });
    sourceBuffer.addEventListener('updateend', handleUpdateEnd, { once: true });
    try {
      sourceBuffer.appendBuffer(bytes);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function appendCachedVideoSegments(params: {
  isCancelled: () => boolean;
  segments: Blob[];
  sourceBuffer: SourceBuffer;
}): Promise<void> {
  for (const segment of params.segments) {
    if (params.isCancelled()) return;
    await appendSourceBuffer(params.sourceBuffer, await segment.arrayBuffer());
  }
}

function finishCachedVideoStream(
  mediaSource: MediaSource,
  isCancelled: () => boolean,
  onFailure: () => void
): void {
  if (isCancelled() || mediaSource.readyState !== 'open') return;
  try {
    mediaSource.endOfStream();
  } catch {
    onFailure();
  }
}

function attachCachedVideoSegments(params: {
  isCancelled: () => boolean;
  mediaSource: MediaSource;
  mediaType: string;
  onFailure: () => void;
  segments: Blob[];
}): void {
  let sourceBuffer: SourceBuffer;
  try {
    sourceBuffer = params.mediaSource.addSourceBuffer(params.mediaType);
    sourceBuffer.mode = 'sequence';
  } catch {
    params.onFailure();
    return;
  }
  void appendCachedVideoSegments({
    isCancelled: params.isCancelled,
    segments: params.segments,
    sourceBuffer,
  }).then(
    () => finishCachedVideoStream(params.mediaSource, params.isCancelled, params.onFailure),
    params.onFailure
  );
}

function useCachedVideoSource(source: PreparedCachedVideoPreview | null): string | null {
  const [attached, setAttached] = useState<{
    source: PreparedCachedVideoPreview;
    src: string;
  } | null>(null);
  useEffect(() => {
    const mediaType = source ? createVideoPreviewCacheMediaType(source.codec) : null;
    if (
      !source ||
      !mediaType ||
      typeof MediaSource === 'undefined' ||
      !MediaSource.isTypeSupported(mediaType) ||
      typeof URL.createObjectURL !== 'function'
    ) {
      setAttached(null);
      return;
    }
    const mediaSource = new MediaSource();
    const nextSrc = URL.createObjectURL(mediaSource);
    let cancelled = false;
    const onFailure = () => {
      if (!cancelled) setAttached(null);
    };
    const handleSourceOpen = () =>
      attachCachedVideoSegments({
        isCancelled: () => cancelled,
        mediaSource,
        mediaType,
        onFailure,
        segments: source.segments,
      });
    mediaSource.addEventListener('sourceopen', handleSourceOpen, { once: true });
    setAttached({ source, src: nextSrc });
    return () => {
      cancelled = true;
      mediaSource.removeEventListener('sourceopen', handleSourceOpen);
      URL.revokeObjectURL(nextSrc);
    };
  }, [source]);
  return attached?.source === source ? attached.src : null;
}

function useCachedVideoPlayback(params: {
  currentTime: number;
  isPlaying: boolean;
  source: PreparedCachedVideoPreview | null;
  src: string | null;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}): void {
  useLayoutEffect(() => {
    const video = params.videoRef.current;
    if (!video || !params.source) return;
    const relativeTime = params.currentTime - params.source.startTime;
    const duration = params.source.endTime - params.source.startTime;
    const nextTime = Math.max(0, Math.min(duration, relativeTime));
    const synchronize = () => {
      const shouldSeek = params.isPlaying
        ? Math.abs(video.currentTime - nextTime) > 0.25
        : shouldRefreshPausedPreviewMediaTime(video.currentTime, nextTime);
      if (shouldSeek) {
        video.style.visibility = 'hidden';
        video.currentTime = nextTime;
      }
      if (!params.isPlaying) video.pause();
      else void video.play().catch(() => undefined);
    };
    const reveal = () => {
      if (video.seeking || video.readyState < 2) return;
      const mismatched = params.isPlaying
        ? Math.abs(video.currentTime - nextTime) > 0.25
        : shouldRefreshPausedPreviewMediaTime(video.currentTime, nextTime);
      if (mismatched) return;
      video.style.visibility = 'visible';
    };
    video.addEventListener('loadedmetadata', synchronize);
    video.addEventListener('seeked', reveal);
    video.addEventListener('loadeddata', reveal);
    synchronize();
    return () => {
      video.removeEventListener('loadedmetadata', synchronize);
      video.removeEventListener('seeked', reveal);
      video.removeEventListener('loadeddata', reveal);
    };
  }, [params.currentTime, params.isPlaying, params.source, params.src, params.videoRef]);
}

export function PreviewStageCachedVideo(props: {
  currentTime: number;
  isPlaying: boolean;
  source: PreparedCachedVideoPreview | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const src = useCachedVideoSource(props.source);
  useCachedVideoPlayback({ ...props, src, videoRef });

  if (!src) return null;
  return (
    <video
      ref={videoRef}
      data-preview-stage-cached-video
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-fill"
      style={{ visibility: 'hidden' }}
      muted
      playsInline
      preload="auto"
      src={src}
    />
  );
}
