import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { usePlaybackSpaceShortcut } from './shortcuts';
/** Owns one preview element and reports decoded, nonseeking frames to capture consumers. */
export function useLibraryPlayback(
  src: string | null,
  externalVideo?: RefObject<HTMLVideoElement | null>,
  onReadyChange?: (ready: boolean) => void,
  enabled = true
) {
  const ownVideo = useRef<HTMLVideoElement>(null);
  const video = externalVideo ?? ownVideo;
  const latestReady = useRef(onReadyChange);
  latestReady.current = onReadyChange;
  const probingDuration = useRef(false);
  const [media, setMedia] = useState<{
    duration: number | null;
    time: number;
    paused: boolean;
    muted: boolean;
    ready: boolean;
  }>({ duration: null, time: 0, paused: true, muted: false, ready: false });
  const [failed, setFailed] = useState(false);
  const ready = src !== null && media.ready;
  const sync = () => {
    const node = video.current;
    if (node) {
      if (probingDuration.current && Number.isFinite(node.duration) && node.duration > 0) {
        probingDuration.current = false;
        node.currentTime = 0;
      }
      const next = readMediaState(node, probingDuration.current);
      latestReady.current?.(next.decoded);
      setMedia(next);
    }
  };
  const loadMetadata = () => {
    const node = video.current;
    if (node && (!Number.isFinite(node.duration) || node.duration <= 0)) {
      probingDuration.current = true;
      node.currentTime = Number.MAX_SAFE_INTEGER;
    }
    sync();
  };
  const toggle = useCallback(() => {
    const node = video.current;
    if (!node || node.readyState < 1 || node.error || probingDuration.current) return;
    if (!node.paused) node.pause();
    else {
      setFailed(false);
      void node.play().catch(() => setFailed(true));
    }
  }, [video]);
  usePlaybackSpaceShortcut(toggle, enabled);
  useEffect(() => {
    probingDuration.current = false;
    setMedia({ duration: null, time: 0, paused: true, muted: false, ready: false });
    setFailed(false);
    latestReady.current?.(false);
    const node = video.current;
    return () => {
      node?.pause();
      node?.removeAttribute('src');
      node?.load();
    };
  }, [src, video]);
  return {
    video,
    media,
    ready,
    sync,
    loadMetadata,
    toggle,
    failed,
    setFailed,
    seek(time: number) {
      const node = video.current;
      if (!node || !Number.isFinite(time) || !Number.isFinite(node.duration)) return;
      node.currentTime = Math.max(0, Math.min(node.duration, time));
      sync();
    },
    toggleMute() {
      const node = video.current;
      if (!node) return;
      node.muted = !node.muted;
      sync();
    },
  };
}

function readMediaState(node: HTMLVideoElement, probing: boolean) {
  const duration = Number.isFinite(node.duration) && node.duration > 0 ? node.duration : null;
  const ready = node.readyState >= 1 && node.error === null && !probing;
  return {
    duration,
    ready,
    decoded: ready && node.readyState >= 2 && !node.seeking,
    time: probing ? 0 : node.currentTime,
    paused: node.paused,
    muted: node.muted,
  };
}
