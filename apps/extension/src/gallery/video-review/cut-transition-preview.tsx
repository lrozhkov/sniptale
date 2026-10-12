import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import {
  planReviewCutTransitions,
  reviewCutTransitionAt,
  type ReviewCutTransitionPlan,
} from '../../features/video/review/cuts';
import type { ReviewEdit } from '../../features/video/review/types';
import {
  createReviewTransitionFrames,
  isReviewTransitionFrame,
  paintReviewCutTransition,
  type ReviewTransitionFrames,
} from '../../workflows/video-review/cut-transition-frames';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';

/** Preview-only media input; persistent edits and the native playback clock remain caller-owned. */
export interface ReviewCutPreviewBinding {
  file: File;
  duration: number;
  edits: readonly ReviewEdit[];
  time: number;
}

export type ReviewCutPreviewRaster = { active: boolean; frame: HTMLCanvasElement | null };

/** Conceals the native raster while composing a transition, including pending seeks and loads. */
export function ReviewCutTransitionPreview(props: {
  binding: ReviewCutPreviewBinding;
  video: RefObject<HTMLVideoElement | null>;
  style: CSSProperties;
  onRaster?: ((raster: ReviewCutPreviewRaster) => void) | undefined;
}) {
  const { binding, onRaster } = props;
  const { plans, blend, current, retry } = useReviewCutTransitionProvider(binding);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mediaTime = useRef(NaN);
  const nativeRaster = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef({
    blend,
    frames: current?.frames ?? null,
    lease: current?.lease,
    plans,
  });
  latest.current = {
    blend,
    frames: current?.frames ?? null,
    lease: current?.lease,
    plans,
  };
  const paint = () => {
    const node = canvas.current;
    const video = props.video.current;
    const context = node?.getContext('2d');
    const state = latest.current;
    if (!node || !video || !context || !state.blend) return;
    const active = state.blend;
    if (!state.frames || !state.lease?.active) return;
    node.width = Math.max(1, video.videoWidth);
    node.height = Math.max(1, video.videoHeight);
    paintReviewCutTransition(context, node, active, state.frames, {
      timestamp: video.seeking ? NaN : mediaTime.current,
      draw: (target, x, y, width, height) =>
        target.drawImage(nativeRaster.current!, x, y, width, height),
    });
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;
  useLayoutEffect(() => paintRef.current(), [blend, current]);
  const activeBlend = Boolean(blend);
  useLayoutEffect(() => {
    onRaster?.({
      active: activeBlend,
      frame: activeBlend && current?.frames ? canvas.current : null,
    });
  }, [activeBlend, current, onRaster]);
  useLayoutEffect(() => () => onRaster?.({ active: false, frame: null }), [onRaster]);
  useEffect(() => {
    mediaTime.current = NaN;
    nativeRaster.current = null;
    const video = props.video.current;
    if (!video || !video.requestVideoFrameCallback) return;
    let callback = 0;
    const frame: VideoFrameRequestCallback = (_now, metadata) => {
      mediaTime.current = NaN;
      const permitted = latest.current.plans.some(
        (plan) =>
          isReviewTransitionFrame(metadata.mediaTime, plan.left) ||
          isReviewTransitionFrame(metadata.mediaTime, plan.right)
      );
      if (!video.seeking && permitted) {
        const raster = nativeRaster.current ?? document.createElement('canvas');
        raster.width = Math.max(1, video.videoWidth);
        raster.height = Math.max(1, video.videoHeight);
        const context = raster.getContext('2d');
        if (context) {
          // Bind the raster to this presentation timestamp before a later seek.
          context.drawImage(video, 0, 0, raster.width, raster.height);
          nativeRaster.current = raster;
          mediaTime.current = metadata.mediaTime;
        }
      }
      paintRef.current();
      callback = video.requestVideoFrameCallback(frame);
    };
    callback = video.requestVideoFrameCallback(frame);
    return () => video.cancelVideoFrameCallback(callback);
  }, [props.video, binding.file]);
  if (!blend) return null;
  return (
    <>
      <canvas
        ref={canvas}
        data-ui="gallery.videoReview.cutTransitionCanvas"
        className="pointer-events-none bg-black"
        style={props.style}
      />
      {!current?.frames ? (
        <div
          role={current?.failed ? 'alert' : 'status'}
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2
            bg-black p-2 text-center text-xs text-white`}
        >
          <span>
            {translate(
              current?.failed
                ? 'gallery.videoReview.cutTransitionFramesUnavailable'
                : 'gallery.videoReview.zoomPreviewLoading'
            )}
          </span>
          {current?.failed ? (
            <ReviewButton label={translate('gallery.videoReview.retry')} onClick={retry} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Endpoint acquisition without the hybrid painter or native frame callback loop.
 * Read after preparation and consume synchronously while the returned lease remains active.
 */
export function useReviewCutTransitionProvider(
  binding: ReviewCutPreviewBinding | undefined,
  managed = false,
  admit?: (bytes: readonly [number, number]) => { release(): void }
) {
  const { plans, blend } = useReviewCutTransitionProjection(binding);
  const next = blend?.plan ?? plans.find((plan) => plan.seam + plan.after > (binding?.time ?? 0));
  const { current, retry } = useTransitionEndpoints(binding?.file, next, managed, admit);
  const latest = useRef({ plans, current, managed });
  latest.current = { plans, current, managed };
  return {
    plans,
    blend,
    current,
    retry,
    read(time: number) {
      const value = latest.current;
      const sampled = reviewCutTransitionAt(time, value.plans);
      if (!sampled) return null;
      const key = JSON.stringify([sampled.plan.left, sampled.plan.right]);
      const admitted =
        value.current?.lease.active && value.current.key === key ? value.current : null;
      return {
        blend: sampled,
        allocationBytes: admitted?.allocationBytes ?? null,
        frames: admitted?.frames ?? null,
        lease: admitted?.lease,
        failed: admitted?.failed ?? false,
      };
    },
  };
}

/** Owns endpoint decoding and invalidates every published pair before disposing it. */
function useTransitionEndpoints(
  file: File | undefined,
  next: ReviewCutTransitionPlan | undefined,
  managed: boolean,
  admit: ((bytes: readonly [number, number]) => { release(): void }) | undefined
) {
  const key = next ? JSON.stringify([next.left, next.right]) : '';
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    file: File;
    key: string;
    frames: ReviewTransitionFrames | null;
    allocationBytes: readonly [number, number] | null;
    failed: boolean;
    lease: { active: boolean };
  } | null>(null);
  useEffect(() => {
    if (!file || !next) return;
    const controller = new AbortController();
    const lease = { active: true };
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    let owner: ReturnType<typeof createReviewTransitionFrames> | null = null;
    let reservation: { release(): void } | undefined;
    setLoaded(null);
    void (async () => {
      try {
        const track = await input.getPrimaryVideoTrack();
        controller.signal.throwIfAborted();
        if (!track) throw new Error('Video track unavailable.');
        owner = createReviewTransitionFrames(new VideoSampleSink(track), controller.signal);
        const frames = await owner.load(next);
        controller.signal.throwIfAborted();
        const allocationBytes = managed && frames ? transitionAllocation(frames) : null;
        if (allocationBytes) reservation = admit?.(allocationBytes);
        setLoaded({ file, key, frames, allocationBytes, failed: !frames, lease });
      } catch {
        owner?.dispose();
        reservation?.release();
        reservation = undefined;
        if (!controller.signal.aborted)
          setLoaded({ file, key, frames: null, allocationBytes: null, failed: true, lease });
      }
    })();
    return () => {
      lease.active = false;
      controller.abort();
      owner?.dispose();
      reservation?.release();
      reservation = undefined;
      input.dispose();
    };
  }, [file, next, key, attempt, managed, admit]);
  const current =
    loaded?.lease.active && loaded.file === file && loaded.key === key ? loaded : null;
  return { current, retry: () => setAttempt((value) => value + 1) };
}

/** Measure decoder payload before publishing or retaining a managed endpoint pair. */
function transitionAllocation(frames: ReviewTransitionFrames): readonly [number, number] {
  const left = frames.left.allocationSize?.();
  const right = frames.right.allocationSize?.();
  if (
    left === undefined ||
    right === undefined ||
    ![left, right, left + right].every((bytes) => Number.isSafeInteger(bytes) && bytes > 0)
  )
    throw new Error('Transition allocation unavailable');
  return [left, right];
}

/** Final output-plane fade, independent of source raster geometry and decoder readiness. */
export function ReviewCutBlackout({ binding }: { binding: ReviewCutPreviewBinding | undefined }) {
  const { blend } = useReviewCutTransitionProjection(binding);
  return blend?.plan.type === 'fade-black' && blend.black > 0 ? (
    <div
      aria-hidden="true"
      data-ui="gallery.videoReview.cutBlackout"
      className="pointer-events-none absolute inset-0 z-40"
      style={{ opacity: blend.black, backgroundColor: blend.plan.color ?? '#000000' }}
    />
  ) : null;
}

function useReviewCutTransitionProjection(binding: ReviewCutPreviewBinding | undefined) {
  const duration = binding?.duration;
  const edits = binding?.edits;
  const plans = useMemo(
    () => (duration !== undefined && edits ? planReviewCutTransitions(duration, edits) : []),
    [duration, edits]
  );
  const blend = reviewCutTransitionAt(binding?.time ?? 0, plans);
  return { plans, blend };
}
