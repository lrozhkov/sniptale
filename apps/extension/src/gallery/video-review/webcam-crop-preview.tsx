import { useEffect, useMemo, useRef, useState } from 'react';
import { cameraContentFrame } from '../../features/video/project/camera/appearance';
import type {
  QuickEditWebcam,
  QuickEditWebcamCrop,
} from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { drawReviewWebcam } from '../../workflows/video-review/render-webcam';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';

/** Inspector framing changes image crop only; the scene placement is edited on the main canvas. */
export function ReviewWebcamCropPreview(props: {
  camera: QuickEditWebcam;
  crop: QuickEditWebcamCrop;
  time: number;
  width: number;
  height: number;
  onChange(crop: QuickEditWebcamCrop): void;
}) {
  const [draft, setDraft] = useState<QuickEditWebcamCrop | null>(null);
  const gesture = useRef<{
    node: HTMLButtonElement;
    pointer: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    origin: QuickEditWebcamCrop;
    value: QuickEditWebcamCrop;
  } | null>(null);
  const crop = draft ?? props.crop;
  const { video, canvas, ready, failed, retry } = useWebcamCropFrame(props, crop);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const cancel = () => {
    const current = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (current?.node.hasPointerCapture(current.pointer))
      current.node.releasePointerCapture(current.pointer);
  };
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);
  return (
    <div data-ui="gallery.videoReview.webcamCrop" className="space-y-2">
      <video ref={video} muted playsInline preload="auto" className="hidden" aria-hidden />
      <button
        type="button"
        aria-label={translate('videoEditor.sidebar.cameraCropPreview')}
        disabled={!ready}
        className="relative mx-auto block w-full touch-none overflow-hidden rounded-sm outline-none
          focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]
          bg-[var(--sniptale-color-surface-muted)]"
        style={{
          aspectRatio: `${props.width} / ${props.height}`,
          maxWidth: `${(144 * props.width) / props.height}px`,
          cursor: draft ? 'grabbing' : 'grab',
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !ready || !video.current) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          const box = event.currentTarget.getBoundingClientRect();
          const content = cameraContentFrame(
            box.width,
            box.height,
            video.current.videoWidth,
            video.current.videoHeight,
            { ...props.camera.appearance, ...props.crop, shape: 'rounded' }
          );
          gesture.current = {
            node: event.currentTarget,
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            dx: box.width - content.width,
            dy: box.height - content.height,
            origin: props.crop,
            value: props.crop,
          };
          setDraft(props.crop);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointer !== event.pointerId) return;
          current.value = {
            ...current.origin,
            panX:
              Math.abs(current.dx) < 0.01
                ? 0
                : clamp(
                    current.origin.panX +
                      (2 * (event.clientX - current.x) * (props.camera.mirrored ? -1 : 1)) /
                        current.dx
                  ),
            panY:
              Math.abs(current.dy) < 0.01
                ? 0
                : clamp(current.origin.panY + (2 * (event.clientY - current.y)) / current.dy),
          };
          setDraft(current.value);
        }}
        onPointerUp={(event) => {
          const current = gesture.current;
          if (!current || current.pointer !== event.pointerId) return;
          cancel();
          if (
            current.value.panX !== current.origin.panX ||
            current.value.panY !== current.origin.panY
          )
            props.onChange(current.value);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && gesture.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
            return;
          }
          const delta = (
            {
              ArrowLeft: [0.1, 0],
              ArrowRight: [-0.1, 0],
              ArrowUp: [0, 0.1],
              ArrowDown: [0, -0.1],
            } as Record<string, number[]>
          )[event.key];
          if (!delta) return;
          event.preventDefault();
          event.stopPropagation();
          props.onChange({
            ...props.crop,
            panX: clamp(props.crop.panX + delta[0]! * (props.camera.mirrored ? -1 : 1)),
            panY: clamp(props.crop.panY + delta[1]!),
          });
        }}
      >
        <canvas ref={canvas} className="pointer-events-none block h-full w-full" />
        {!ready ? (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-xs">
            {translate(
              failed
                ? 'videoEditor.sidebar.framingPreviewFailed'
                : 'videoEditor.sidebar.framingPreviewLoading'
            )}
          </span>
        ) : null}
      </button>
      {failed ? (
        <ReviewButton label={translate('gallery.videoReview.retry')} onClick={retry} />
      ) : null}
    </div>
  );
}

/** Asset lifetime is independent from seeking and authored crop changes. */
function useWebcamCropFrame(
  props: Parameters<typeof ReviewWebcamCropPreview>[0],
  crop: QuickEditWebcamCrop
) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0),
    [attempt, setAttempt] = useState(0);
  const framing = useMemo(
    () => ({ zoom: crop.zoom, panX: crop.panX, panY: crop.panY }),
    [crop.zoom, crop.panX, crop.panY]
  );
  const time = Math.max(0, props.time - props.camera.offsetSeconds);
  const latestTime = useRef(time);
  latestTime.current = time;
  useEffect(() => {
    const media = video.current!;
    let disposed = false,
      url: string | undefined;
    setReady(false);
    setFailed(false);
    const seek = () => {
      media.currentTime = Math.min(Math.max(0, media.duration - 0.001), latestTime.current);
    };
    const loaded = () => {
      setReady(media.readyState >= 2);
      setRevision((value) => value + 1);
    };
    const error = () => {
      if (!disposed) {
        setReady(false);
        setFailed(true);
      }
    };
    media.addEventListener('loadedmetadata', seek);
    media.addEventListener('loadeddata', loaded);
    media.addEventListener('seeked', loaded);
    media.addEventListener('error', error);
    void resolveReviewAssetBytes(props.camera.assetId)
      .then((blob) => {
        if (disposed) return;
        if (!blob) {
          error();
          return;
        }
        url = URL.createObjectURL(blob);
        media.src = url;
        media.load();
      })
      .catch(error);
    return () => {
      disposed = true;
      media.removeEventListener('loadedmetadata', seek);
      media.removeEventListener('loadeddata', loaded);
      media.removeEventListener('seeked', loaded);
      media.removeEventListener('error', error);
      media.pause();
      media.removeAttribute('src');
      media.load();
      if (url) URL.revokeObjectURL(url);
    };
  }, [props.camera.assetId, attempt]);
  useEffect(() => {
    const media = video.current;
    if (media && Number.isFinite(media.duration))
      media.currentTime = Math.min(Math.max(0, media.duration - 0.001), time);
  }, [time]);
  useEffect(() => {
    const target = canvas.current,
      media = video.current;
    if (!target || !media || !ready) return;
    const draw = () => {
      const box = target.getBoundingClientRect();
      target.width = Math.max(1, Math.round(box.width * Math.min(2, window.devicePixelRatio || 1)));
      target.height = Math.max(
        1,
        Math.round(box.height * Math.min(2, window.devicePixelRatio || 1))
      );
      const context = target.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, target.width, target.height);
      drawReviewWebcam(
        context,
        target,
        { ...props.camera, shadow: { intensity: 0, color: '#000000ff' } },
        { x: 0, y: 0, width: 1, height: 1 },
        { width: media.videoWidth, height: media.videoHeight },
        { draw: (ctx, x, y, w, h) => ctx.drawImage(media, x, y, w, h) },
        framing
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(target);
    return () => observer.disconnect();
  }, [ready, revision, props.camera, framing, props.width, props.height]);
  return { video, canvas, ready, failed, retry: () => setAttempt((value) => value + 1) };
}
