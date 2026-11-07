import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cameraContentFrame } from '../../features/video/project/camera/appearance';
import type {
  QuickEditWebcam,
  QuickEditWebcamCrop,
} from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { createPreviewPresentationSession } from '../../features/video/composition/canvas/preview-presentation';
import { ReviewPreviewRendererContext } from './use-preview-preferences';
import { createWebcamCropPaintOwner } from './webcam-crop-paint';
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
  const { video, canvas, gpuHost, ready, failed, retry } = useWebcamCropFrame(props, crop);
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
        <div
          ref={gpuHost}
          data-ui="gallery.videoReview.webcamCrop.gpuHost"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
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
    canvas = useRef<HTMLCanvasElement>(null),
    gpuHost = useRef<HTMLDivElement>(null);
  const renderer = useContext(ReviewPreviewRendererContext);
  const [source, setSource] = useState<{ assetId: string; attempt: number; time: number } | null>(
    null
  );
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0),
    [attempt, setAttempt] = useState(0);
  const paint = useRef<ReturnType<typeof createWebcamCropPaintOwner> | null>(null);
  useLayoutEffect(() => {
    const target = canvas.current,
      media = video.current;
    if (!target || !media) return;
    const presenter = createPreviewPresentationSession({
      fallback: () => canvas.current,
      host: () => gpuHost.current,
      role: 'inspector',
      background: 'transparent',
    });
    presenter.mount();
    const owner = createWebcamCropPaintOwner({
      target,
      media,
      presenter,
      fail: () => setFailed(true),
    });
    paint.current = owner;
    return () => {
      paint.current = null;
      owner.dispose();
      presenter.dispose();
    };
  }, []);
  const time = Math.max(0, props.time - props.camera.offsetSeconds);
  const latestTime = useRef(time);
  latestTime.current = time;
  const ready =
    source?.assetId === props.camera.assetId &&
    source.attempt === attempt &&
    source.time === time &&
    !failed;
  useEffect(() => {
    const media = video.current!;
    let disposed = false,
      url: string | undefined;
    paint.current?.cancel();
    setSource(null);
    setFailed(false);
    const seek = () => {
      media.currentTime = Math.min(Math.max(0, media.duration - 0.001), latestTime.current);
    };
    const loaded = () => {
      if (
        disposed ||
        !url ||
        (media.currentSrc || media.src) !== url ||
        media.seeking ||
        media.readyState < 2
      )
        return;
      const expected = Math.min(Math.max(0, media.duration - 0.001), latestTime.current);
      if (!Number.isFinite(expected) || Math.abs(media.currentTime - expected) > 0.001) return;
      setSource({ assetId: props.camera.assetId, attempt, time: latestTime.current });
      setRevision((value) => value + 1);
    };
    const error = () => {
      if (!disposed) {
        paint.current?.cancel();
        setSource(null);
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
      paint.current?.cancel();
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
    paint.current?.cancel();
    if (media && media.readyState >= 1 && !Number.isNaN(media.duration)) {
      const target = Math.min(Math.max(0, media.duration - 0.001), time);
      if (media.currentTime !== target) {
        setSource(null);
        media.currentTime = target;
      } else if (!media.seeking && media.readyState >= 2) {
        setSource((current) =>
          current?.assetId === props.camera.assetId && current.attempt === attempt
            ? { ...current, time }
            : current
        );
      }
    }
  }, [time, props.camera.assetId, attempt]);
  useEffect(() => {
    const target = canvas.current;
    if (!target || !ready) {
      paint.current?.cancel();
      return;
    }
    const framing = { zoom: crop.zoom, panX: crop.panX, panY: crop.panY };
    const draw = () => paint.current?.request({ camera: props.camera, crop: framing, renderer });
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(target);
    return () => {
      observer.disconnect();
      paint.current?.cancel();
    };
  }, [
    ready,
    revision,
    props.camera,
    crop.zoom,
    crop.panX,
    crop.panY,
    props.width,
    props.height,
    renderer,
  ]);
  return {
    video,
    canvas,
    gpuHost,
    ready,
    failed,
    retry: () => {
      paint.current?.reset();
      setAttempt((value) => value + 1);
    },
  };
}
