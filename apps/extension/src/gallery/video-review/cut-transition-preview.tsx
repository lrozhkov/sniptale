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

/** Conceals the native raster while composing a transition, including pending seeks and loads. */
export function ReviewCutTransitionPreview(props: {
  binding: ReviewCutPreviewBinding;
  video: RefObject<HTMLVideoElement | null>;
  style: CSSProperties;
}) {
  const { binding } = props;
  const plans = useMemo(
    () => planReviewCutTransitions(binding.duration, binding.edits),
    [binding.duration, binding.edits]
  );
  const blend = reviewCutTransitionAt(binding.time, plans);
  const next = blend?.plan ?? plans.find((plan) => plan.seam + plan.after > binding.time);
  const { current, retry } = useTransitionEndpoints(binding.file, next);
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

/** Owns endpoint decoding and invalidates every published pair before disposing it. */
function useTransitionEndpoints(file: File, next: ReviewCutTransitionPlan | undefined) {
  const key = next ? JSON.stringify([next.left, next.right]) : '';
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    file: File;
    key: string;
    frames: ReviewTransitionFrames | null;
    failed: boolean;
    lease: { active: boolean };
  } | null>(null);
  useEffect(() => {
    if (!next) return;
    const controller = new AbortController();
    const lease = { active: true };
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    let owner: ReturnType<typeof createReviewTransitionFrames> | null = null;
    setLoaded(null);
    void (async () => {
      try {
        const track = await input.getPrimaryVideoTrack();
        controller.signal.throwIfAborted();
        if (!track) throw new Error('Video track unavailable.');
        owner = createReviewTransitionFrames(new VideoSampleSink(track), controller.signal);
        const frames = await owner.load(next);
        controller.signal.throwIfAborted();
        setLoaded({ file, key, frames, failed: !frames, lease });
      } catch {
        if (!controller.signal.aborted) setLoaded({ file, key, frames: null, failed: true, lease });
      }
    })();
    return () => {
      lease.active = false;
      controller.abort();
      owner?.dispose();
      input.dispose();
    };
  }, [file, next, key, attempt]);
  const current =
    loaded?.lease.active && loaded.file === file && loaded.key === key ? loaded : null;
  return { current, retry: () => setAttempt((value) => value + 1) };
}
