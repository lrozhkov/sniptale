import type { VideoMediaFitMode } from '../../../../../features/video/project/types';
import { useEffect, useRef, useState } from 'react';
import {
  cameraContentFrame,
  type CameraAppearance,
} from '../../../../../features/video/project/camera/appearance';
import { drawFittedMediaLayer } from '../../../../../features/video/composition/draw/fitted-media';
import { translate } from '../../../../../platform/i18n';

interface CameraCropPreviewProps {
  url: string | undefined;
  sourceTime: number;
  width: number;
  height: number;
  appearance: CameraAppearance;
  fitMode?: VideoMediaFitMode;
  disabled: boolean;
  onChange: (appearance: CameraAppearance) => void;
}

export function CameraCropPreview(props: CameraCropPreviewProps) {
  const [draft, setDraft] = useState<CameraAppearance | null>(null);
  const gesture = useRef<{
    pointer: number;
    x: number;
    y: number;
    origin: CameraAppearance;
    dx: number;
    dy: number;
  } | null>(null);
  const appearance = draft ?? props.appearance;
  const { video, canvas, ready, failed, retry } = useCameraCropFrame(props, appearance);
  useEffect(() => {
    if (props.disabled) {
      gesture.current = null;
      setDraft(null);
    }
  }, [props.disabled]);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const cancel = () => {
    gesture.current = null;
    setDraft(null);
  };
  return (
    <div className="space-y-1" data-ui="video-editor.camera-crop">
      <video ref={video} muted playsInline preload="auto" className="hidden" aria-hidden="true" />
      <button
        type="button"
        data-video-editor-local-navigation="true"
        aria-label={translate('videoEditor.sidebar.cameraCropPreview')}
        disabled={props.disabled || !ready}
        className={`relative mx-auto block max-h-44 w-full touch-none overflow-hidden rounded-md
bg-[var(--sniptale-color-surface-muted)] disabled:cursor-default`}
        style={{
          aspectRatio: `${props.width} / ${props.height}`,
          maxWidth: `${(176 * props.width) / props.height}px`,
          cursor: draft ? 'grabbing' : 'grab',
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || props.disabled || !ready || !video.current) return;
          const box = event.currentTarget.getBoundingClientRect();
          const content = cameraContentFrame(
            box.width,
            box.height,
            video.current.videoWidth,
            video.current.videoHeight,
            props.appearance,
            props.fitMode === 'STRETCH'
          );
          gesture.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            origin: props.appearance,
            dx: box.width - content.width,
            dy: box.height - content.height,
          };
          setDraft(props.appearance);
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start || start.pointer !== event.pointerId) return;
          setDraft({
            ...start.origin,
            panX:
              Math.abs(start.dx) < 0.01
                ? 0
                : clamp(start.origin.panX + (2 * (event.clientX - start.x)) / start.dx),
            panY:
              Math.abs(start.dy) < 0.01
                ? 0
                : clamp(start.origin.panY + (2 * (event.clientY - start.y)) / start.dy),
          });
        }}
        onPointerUp={(event) => {
          if (gesture.current?.pointer !== event.pointerId) return;
          const value = draft;
          cancel();
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (
            value &&
            !props.disabled &&
            (value.panX !== props.appearance.panX || value.panY !== props.appearance.panY)
          )
            props.onChange(value);
        }}
        onLostPointerCapture={cancel}
        onPointerCancel={cancel}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancel();
            event.stopPropagation();
            return;
          }
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [0.1, 0],
            ArrowRight: [-0.1, 0],
            ArrowUp: [0, 0.1],
            ArrowDown: [0, -0.1],
          };
          const delta = directions[event.key];
          if (!delta) return;
          event.preventDefault();
          event.stopPropagation();
          props.onChange({
            ...props.appearance,
            panX: clamp(props.appearance.panX + delta[0]),
            panY: clamp(props.appearance.panY + delta[1]),
          });
        }}
      >
        <canvas ref={canvas} className="block h-full w-full pointer-events-none" />
        {!ready ? (
          <span
            className={`absolute inset-0 flex items-center justify-center p-2 text-xs
text-[var(--sniptale-color-text-secondary)]`}
          >
            {translate(
              failed
                ? 'videoEditor.sidebar.framingPreviewFailed'
                : 'videoEditor.sidebar.framingPreviewLoading'
            )}
          </span>
        ) : null}
      </button>
      {failed ? (
        <button type="button" className="text-xs underline" onClick={retry}>
          {translate('common.actions.retry')}
        </button>
      ) : null}
    </div>
  );
}

function useCameraCropFrame(props: CameraCropPreviewProps, appearance: CameraAppearance) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    setReady(false);
    setFailed(false);
    const seek = () => {
      media.currentTime = props.sourceTime;
    };
    const loaded = () => {
      setReady(true);
      setRevision((value) => value + 1);
    };
    const error = () => {
      setReady(false);
      setFailed(true);
    };
    media.addEventListener('loadedmetadata', seek);
    media.addEventListener('loadeddata', loaded);
    media.addEventListener('seeked', loaded);
    media.addEventListener('error', error);
    if (props.url) {
      media.src = props.url;
      media.load();
    } else error();
    return () => {
      media.removeEventListener('loadedmetadata', seek);
      media.removeEventListener('loadeddata', loaded);
      media.removeEventListener('seeked', loaded);
      media.removeEventListener('error', error);
      media.removeAttribute('src');
      media.load();
    };
  }, [props.url, props.sourceTime]);
  useEffect(() => {
    const target = canvas.current,
      media = video.current;
    if (!target || !media || !ready) return;
    const draw = () => {
      const rect = target.getBoundingClientRect();
      target.width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
      target.height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
      const context = target.getContext('2d');
      if (!context) return;
      drawFittedMediaLayer({
        context,
        displayScale: 1,
        fitMode: props.fitMode ?? 'COVER',
        frame: { x: 0, y: 0, width: target.width, height: target.height },
        cameraAppearance: appearance,
        shadowIntensity: 0,
        shadowMode: undefined,
        sourceWidth: media.videoWidth,
        sourceHeight: media.videoHeight,
        render: (x, y, w, h) => context.drawImage(media, x, y, w, h),
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(target);
    window.addEventListener('resize', draw);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [appearance, ready, revision, props.width, props.height, props.fitMode]);
  return {
    video,
    canvas,
    ready,
    failed,
    retry: () => {
      setFailed(false);
      video.current?.load();
    },
  };
}
