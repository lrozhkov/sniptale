import { useWaveformViewport } from './use-waveform-viewport';
import type { ReviewWaveformWindow } from '../../workflows/video-review/waveform';
import type { ReviewTrackProjection } from './track-projection';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadReviewWaveform, type ReviewWaveform } from '../../workflows/video-review/waveform';
import { subscribeToMediaHubEvents } from '../../features/media-hub/events';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';

/** A disposable waveform cache; stale reads cannot update a replaced editor. */
export function useReviewWaveforms(
  source: Blob,
  duration: number,
  audio: { voiceover: readonly QuickEditAudioClip[]; music: readonly QuickEditAudioClip[] },
  enabled: boolean,
  hasOriginalAudio = true
) {
  const [waveforms, setWaveforms] = useState<ReadonlyMap<string, ReviewWaveform>>(new Map());
  const [revision, setRevision] = useState(0);
  const cache = useRef(new Map<string, Promise<ReviewWaveform | null>>());
  useEffect(
    () =>
      subscribeToMediaHubEvents((event) => {
        if (event.type !== 'library-changed') return;
        for (const id of event.assetIds) cache.current.delete(id);
        setRevision((value) => value + 1);
      }),
    []
  );
  const assetIds = useRef<string[]>([]);
  assetIds.current = [
    ...new Set([...audio.voiceover, ...audio.music].map((clip) => clip.assetId)),
  ].sort();
  const ids = JSON.stringify(assetIds.current);
  useEffect(() => {
    cache.current.clear();
    setWaveforms(new Map());
  }, [source]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const read = (id: string, resolve: () => Promise<ReviewWaveform | null>) => {
      let pending = cache.current.get(id);
      if (!pending) {
        pending = resolve().catch(() => null);
        cache.current.set(id, pending);
      }
      void pending.then((value) => {
        if (active && value) setWaveforms((current) => new Map(current).set(id, value));
      });
    };
    if (hasOriginalAudio) read('original', () => loadReviewWaveform(source, duration));
    for (const id of assetIds.current)
      read(id, async () => {
        const blob = await resolveReviewAssetBytes(id);
        return blob ? loadReviewWaveform(blob) : null;
      });
    return () => {
      active = false;
    };
  }, [source, duration, ids, enabled, hasOriginalAudio, revision]);
  return waveforms;
}

/** Peak envelope uses the actual trimmed source window; no decorative waveform is fabricated. */
export function ReviewAudioWaveform(props: {
  projection?: ReviewTrackProjection | undefined;
  timelineStart?: number;
  waveform?: ReviewWaveform | undefined;
  offset?: number;
  duration: number;
  volume: number;
  muted: boolean;
  fadeIn?: number;
  fadeOut?: number;
}) {
  const viewport = useWaveformViewport();
  const wave = props.waveform;
  const localAt = useCallback(
    (fraction: number) => {
      const projection = props.projection;
      if (!projection) return fraction * props.duration;
      const start = projection.source(props.timelineStart ?? 0);
      const end = projection.source((props.timelineStart ?? 0) + props.duration, 'end');
      return projection.output(start + fraction * (end - start)) - (props.timelineStart ?? 0);
    },
    [props.projection, props.duration, props.timelineStart]
  );
  const start = Math.max(0, Math.floor((props.offset ?? 0) + localAt(viewport.start)));
  const end = Math.min(wave?.duration ?? 0, Math.ceil((props.offset ?? 0) + localAt(viewport.end)));
  const buckets = Math.max(
    1,
    Math.min(8192, Math.ceil(viewport.width * (viewport.end - viewport.start)))
  );
  const [detail, setDetail] = useState<{
    wave: ReviewWaveform;
    value: ReviewWaveformWindow;
  } | null>(null);
  useEffect(() => {
    if (
      !wave?.loadWindow ||
      end <= start ||
      wave.duration / wave.peaks.length <= (end - start) / buckets
    )
      return;
    const controller = new AbortController();
    let active = true;
    void wave
      .loadWindow(start, end, buckets, controller.signal)
      .then((value) => {
        if (active && value) setDetail({ wave, value });
      })
      .catch(() => {
        /* The overview remains available when refinement cannot decode. */
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [wave, start, end, buckets]);
  const path = useMemo(() => {
    const wave = props.waveform;
    if (!wave || !wave.peaks.length) return '';
    const count = Math.min(buckets, Math.max(wave.peaks.length, detail?.value.peaks.length ?? 0));
    let result = '';
    for (let i = 0; i < count; i++) {
      const fraction = viewport.start + (i / count) * (viewport.end - viewport.start);
      const nextFraction = viewport.start + ((i + 1) / count) * (viewport.end - viewport.start);
      const local = localAt(fraction);
      const start = (props.offset ?? 0) + local;
      const end = (props.offset ?? 0) + localAt(nextFraction);
      if (end <= start) continue;
      const window =
        detail?.wave === wave && start >= detail.value.start && end <= detail.value.end
          ? detail.value
          : null;
      const peaks = window?.peaks ?? wave.peaks;
      const origin = window?.start ?? 0;
      const length = window ? window.end - window.start : wave.duration;
      const from = Math.max(0, Math.floor(((start - origin) / length) * peaks.length));
      const to = Math.min(
        peaks.length,
        Math.max(from + 1, Math.ceil(((end - origin) / length) * peaks.length))
      );
      let peak = 0;
      for (let sample = from; sample < to; sample++) peak = Math.max(peak, peaks[sample] ?? 0);
      const envelope = Math.min(
        1,
        props.fadeIn ? local / props.fadeIn : 1,
        props.fadeOut ? (props.duration - local) / props.fadeOut : 1
      );
      const amplitude = Math.min(1, peak * props.volume * envelope) * 44;
      const x = ((fraction + nextFraction) / 2) * 100;
      result += `M${x.toFixed(2)} ${(50 - amplitude).toFixed(2)}V${(50 + amplitude).toFixed(2)}`;
    }
    return result;
  }, [
    buckets,
    detail,
    viewport.start,
    viewport.end,
    localAt,
    props.waveform,
    props.offset,
    props.duration,
    props.volume,
    props.fadeIn,
    props.fadeOut,
  ]);
  return (
    <svg
      ref={viewport.ref}
      data-ui="gallery.videoReview.waveform"
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full text-[var(--sniptale-color-text-secondary)]"
      style={{ opacity: props.muted ? 0.2 : 0.65 }}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={100 / viewport.width} />
    </svg>
  );
}
