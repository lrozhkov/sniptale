import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  createReviewTransportController,
  type ReviewTransportPosition,
  type ReviewTransportFailure,
  type ReviewTransportAudioRequest,
  type ReviewTransportAudioClock,
} from './transport';
import type { ReviewPlaybackPresentationClock } from './playback-presentation-clock';
import type { ReviewEdit } from '../../features/video/review/types';
import type { QuickEditOriginalAudio } from '../../features/video/review/advanced/types';

interface ReviewPlaybackProps {
  sourceId?: string;
  duration: number;
  edits: readonly ReviewEdit[];
  readEdits?(): readonly ReviewEdit[];
  boundaries(): readonly number[] | undefined;
  onSeek(value: number): void;
  onFailure(failure: ReviewTransportFailure): void;
  prepareAfterSeek?:
    | ((signal: AbortSignal, request: ReviewTransportAudioRequest) => Promise<boolean>)
    | undefined;
  onPreparedPlay?: ((request: ReviewTransportAudioRequest) => void) | undefined;
  onStopPlayback?: (() => void) | undefined;
  readAudioClock?: (() => ReviewTransportAudioClock | null) | undefined;
  onRecovered?: (() => void) | undefined;
  onInvalidRange?: (() => void) | undefined;
  original: QuickEditOriginalAudio;
  silent?: boolean;
  retainCutTime?: boolean;
}

/** Native resources and one frame driver adapt the single Gallery transport authority. */
export function useReviewPlayback(props: ReviewPlaybackProps) {
  const video = useRef<HTMLVideoElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const configuration = useCallback(
    () => ({
      sourceId: latest.current.sourceId ?? 'gallery-source',
      duration: latest.current.duration,
      edits: latest.current.readEdits?.() ?? latest.current.edits,
      original: latest.current.original,
      silent: latest.current.silent ?? false,
      retainCutTime: latest.current.retainCutTime ?? false,
      boundaries: () => latest.current.boundaries(),
    }),
    []
  );
  const [transport] = useState(() => {
    let recovery: { node: HTMLVideoElement; preload: HTMLVideoElement['preload'] } | null = null;
    return createReviewTransportController(configuration(), {
      now: () => performance.now(),
      schedule(delay, callback) {
        const handle = window.setTimeout(callback, delay);
        return () => window.clearTimeout(handle);
      },
      media: {
        read() {
          const node = video.current;
          return node
            ? {
                sourceId:
                  node.currentSrc || node.src || (latest.current.sourceId ?? 'gallery-source'),
                time: node.currentTime,
                paused: node.paused,
                ended: node.ended,
                seeking: node.seeking,
                readyState: node.readyState,
                errorCode: node.error?.code ?? null,
              }
            : null;
        },
        seek(time) {
          const node = video.current;
          if (node && node.currentTime !== time) node.currentTime = time;
        },
        async play() {
          await video.current?.play();
        },
        pause() {
          video.current?.pause();
        },
        configure({ rate, muted, volume }) {
          const node = video.current;
          if (!node) return;
          if (node.playbackRate !== rate) node.playbackRate = rate;
          if (!node.preservesPitch) node.preservesPitch = true;
          if (node.muted !== muted) node.muted = muted;
          if (node.volume !== volume) node.volume = volume;
        },
        recoveryMode(active) {
          if (active && video.current)
            recovery = { node: video.current, preload: video.current.preload };
          else if (recovery) {
            recovery.node.preload = recovery.preload;
            recovery = null;
          }
        },
        reload() {
          const node = video.current;
          if (!node) return;
          node.preload = 'auto';
          node.load();
        },
      },
      audio: {
        readClock: () => latest.current.readAudioClock?.() ?? null,
        prepare: (signal, request) => latest.current.prepareAfterSeek?.(signal, request) ?? true,
        start: (request) => latest.current.onPreparedPlay?.(request),
        stop: () => latest.current.onStopPlayback?.(),
      },
      onSeek: (time) => latest.current.onSeek(time),
      onFailure: (failure) => latest.current.onFailure(failure),
      onRecovered: () => latest.current.onRecovered?.(),
      onInvalidRange: () => latest.current.onInvalidRange?.(),
    });
  });
  const status = useSyncExternalStore(transport.subscribeStatus, transport.getStatusSnapshot);
  const acceptedConfiguration = useMemo(configuration, [
    configuration,
    props.sourceId,
    props.duration,
    props.edits,
    props.readEdits,
    props.original,
    props.silent,
    props.retainCutTime,
  ]);
  useLayoutEffect(
    () => transport.configure(acceptedConfiguration),
    [transport, acceptedConfiguration]
  );
  const syncConfiguration = useCallback(
    () => transport.configure(configuration()),
    [transport, configuration]
  );
  const lifetime = useRef({ revision: 0 });
  useEffect(() => {
    const lifecycle = lifetime.current;
    const revision = ++lifecycle.revision;
    return () => {
      transport.deactivate();
      queueMicrotask(() => {
        if (lifecycle.revision === revision) transport.dispose();
      });
    };
  }, [transport]);
  useEffect(() => {
    if (status.mode !== 'playing' && status.mode !== 'preparing') return;
    let frame = 0;
    const advance = () => {
      transport.tick();
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [transport, status.mode]);
  // Compatibility consumers share one accepted sample. They cannot publish another clock.
  const [presentation] = useState(() => {
    let position = transport.readPosition();
    const listeners = new Set<() => void>();
    const clock: ReviewPlaybackPresentationClock = {
      read: () => position.source?.sourceTime ?? position.media?.time ?? 0,
      readResult: () => position.resultTime,
      isPlaying: () => transport.getStatusSnapshot().playing,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    return {
      clock,
      update(next: ReviewTransportPosition) {
        position = next;
        for (const listener of listeners) listener();
      },
    };
  });
  useLayoutEffect(
    () => transport.subscribePosition(presentation.update),
    [transport, presentation]
  );
  const playheadClock = presentation.clock;
  const onTime = useCallback(() => {
    transport.tick();
    const position = transport.readPosition();
    return position.source?.sourceTime ?? position.media?.time ?? 0;
  }, [transport]);
  const onMediaPlayback = useCallback(
    (playing: boolean) => transport.observeMedia(playing ? 'play' : 'pause'),
    [transport]
  );
  const onMediaReady = useCallback(
    (event: 'metadata' | 'seeked' | 'ready') => transport.observeMedia(event),
    [transport]
  );
  return {
    transport,
    syncConfiguration,
    readPosition: transport.readPosition,
    pauseAt: transport.pauseAt,
    video,
    playheadClock,
    time: status.position.source?.sourceTime ?? status.position.media?.time ?? 0,
    playing: status.playing,
    preparingPlayback: status.mode === 'preparing',
    recovering: status.mode === 'recovering',
    playbackRange: status.range,
    seekRevision: status.seekRevision,
    navigationRevision: status.navigationRevision,
    pause: transport.pause,
    seek: transport.seekSource,
    seekResult: transport.seekResult,
    play: transport.toggle,
    setPlaybackRange: transport.setRange,
    onTime,
    onMediaPlayback,
    onMediaReady,
    onEnded: () => transport.observeMedia('ended'),
    onMediaError: () => transport.observeMedia('error'),
  };
}
