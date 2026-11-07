import type { GpuPreviewOutput } from '../../../../../features/video/composition/canvas/preview-presentation';
import { WorkspacePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { createPreviewPresentationSession } from '../../../../../features/video/composition/canvas/preview-presentation';

import { createCameraCropGpuRenderer } from '../../../../../features/video/composition/canvas/camera-crop-gpu';
import type { VideoMediaFitMode } from '../../../../../features/video/project/types';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  cameraContentFrame,
  cameraWindowFrame,
  type CameraAppearance,
} from '../../../../../features/video/project/camera/appearance';
import {
  drawFittedMediaLayer,
  drawCameraMediaSource,
} from '../../../../../features/video/composition/draw/fitted-media';
import { translate } from '../../../../../platform/i18n';

interface CameraCropPreviewProps {
  url: string | undefined;
  sourceTime: number;
  width: number;
  height: number;
  appearance: CameraAppearance;
  mirrored?: boolean;
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
  const frame = cameraWindowFrame(
    { x: 0, y: 0, width: props.width, height: props.height },
    appearance.shape
  );
  const { video, canvas, gpuHost, ready, failed, retry } = useCameraCropFrame(props, appearance);
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
          aspectRatio: `${frame.width} / ${frame.height}`,
          maxWidth: `${(176 * frame.width) / frame.height}px`,
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
                : clamp(
                    start.origin.panX +
                      (2 * (event.clientX - start.x) * (props.mirrored ? -1 : 1)) / start.dx
                  ),
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
            panX: clamp(props.appearance.panX + delta[0] * (props.mirrored ? -1 : 1)),
            panY: clamp(props.appearance.panY + delta[1]),
          });
        }}
      >
        <canvas ref={canvas} className="block h-full w-full pointer-events-none" />
        <div
          ref={gpuHost}
          data-ui="video-editor.camera-crop.gpu-host"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
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

interface CropFrameInput {
  url: string | undefined;
  sourceTime: number;
  appearance: CameraAppearance;
  mirrored: boolean;
  fitMode: VideoMediaFitMode;
  renderer: 'gpu' | 'legacy';
  ready: boolean;
}

function useCameraCropFrame(props: CameraCropPreviewProps, appearance: CameraAppearance) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gpuHost = useRef<HTMLDivElement>(null);
  const renderer = useContext(WorkspacePreviewContext)?.preferences.preferences.renderer ?? 'gpu';
  const mirrored = props.mirrored ?? false;
  const fitMode = props.fitMode ?? 'COVER';
  const [source, setSource] = useState<{ url: string | undefined; time: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const ready = source?.url === props.url && source?.time === props.sourceTime && !failed;
  const latest = useRef<CropFrameInput>({
    url: props.url,
    sourceTime: props.sourceTime,
    appearance,
    mirrored,
    fitMode,
    renderer,
    ready,
  });
  latest.current = {
    url: props.url,
    sourceTime: props.sourceTime,
    appearance,
    mirrored,
    fitMode,
    renderer,
    ready,
  };
  const queueRef = useRef<ReturnType<typeof createCameraCropFrameQueue> | null>(null);
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
    const queue = createCameraCropFrameQueue({
      target,
      media,
      presenter,
      read: () => latest.current,
      fail: () => setFailed(true),
    });
    queueRef.current = queue;
    return () => {
      queue.dispose();
      queueRef.current = null;
      presenter.dispose();
    };
  }, []);
  const sourceTime = useRef(props.sourceTime);
  useEffect(() => {
    sourceTime.current = props.sourceTime;
    queueRef.current?.cancel();
    const media = video.current;
    if (media && media.readyState >= 1) media.currentTime = props.sourceTime;
  }, [props.sourceTime]);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    queueRef.current?.cancel();
    setSource(null);
    setFailed(false);
    const seek = () => {
      media.currentTime = sourceTime.current;
    };
    const loaded = () => {
      if (media.readyState < 2 || media.seeking) return;
      setSource({ url: props.url, time: sourceTime.current });
      setFailed(false);
      setRevision((value) => value + 1);
    };
    const error = () => {
      queueRef.current?.cancel();
      setSource(null);
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
      queueRef.current?.cancel();
      media.removeEventListener('loadedmetadata', seek);
      media.removeEventListener('loadeddata', loaded);
      media.removeEventListener('seeked', loaded);
      media.removeEventListener('error', error);
      media.removeAttribute('src');
      media.load();
    };
  }, [props.url]);
  useEffect(() => {
    if (!ready) {
      queueRef.current?.cancel();
      return;
    }
    queueRef.current?.request();
  }, [
    mirrored,
    appearance.shape,
    appearance.roundness,
    appearance.zoom,
    appearance.panX,
    appearance.panY,
    ready,
    revision,
    props.width,
    props.height,
    fitMode,
    renderer,
  ]);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const draw = () => {
      if (latest.current.ready) queueRef.current?.request();
    };
    const observer = new ResizeObserver(draw);
    observer.observe(target);
    window.addEventListener('resize', draw);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, []);
  return {
    video,
    canvas,
    gpuHost,
    ready,
    failed,
    retry: () => {
      queueRef.current?.reset();
      setSource(null);
      setFailed(false);
      video.current?.load();
    },
  };
}

/** One admitted source capture at a time; replacement requests retain only the latest UI input. */
function createCameraCropFrameQueue(options: {
  target: HTMLCanvasElement;
  media: HTMLVideoElement;
  presenter: ReturnType<typeof createPreviewPresentationSession>;
  read: () => CropFrameInput;
  fail: () => void;
}) {
  let gpu: ReturnType<typeof createCameraCropGpuRenderer> | null = null;
  let controller: AbortController | null = null;
  let version = 0,
    wanted = false,
    running = false,
    disposed = false,
    reset = false;
  const cancel = () => {
    version++;
    wanted = false;
    controller?.abort();
  };
  const drain = async () => {
    try {
      while (wanted && !disposed) {
        wanted = false;
        const ticket = version,
          input = options.read(),
          media = options.media,
          target = options.target;
        if (!input.ready || media.readyState < 2 || media.seeking) continue;
        controller = new AbortController();
        const signal = controller.signal;
        const rect = target.getBoundingClientRect();
        const size = {
          width: Math.max(1, Math.round(rect.width * window.devicePixelRatio)),
          height: Math.max(1, Math.round(rect.height * window.devicePixelRatio)),
        };
        let output: GpuPreviewOutput | undefined | false;
        let accepted = false;
        try {
          if (reset) {
            gpu?.dispose();
            gpu = null;
            reset = false;
          }
          if (input.renderer === 'legacy') {
            gpu?.dispose();
            gpu = null;
            output = undefined;
          } else {
            gpu ??= createCameraCropGpuRenderer();
            output = await gpu.render({
              media,
              size,
              appearance: input.appearance,
              fitMode: input.fitMode,
              mirrored: input.mirrored,
              signal,
              acquire: options.presenter.acquire,
            });
          }
          const current = options.read();
          if (
            disposed ||
            signal.aborted ||
            ticket !== version ||
            !current.ready ||
            current.url !== input.url ||
            current.sourceTime !== input.sourceTime
          )
            continue;
          if (output === false) continue;
          if (!output) {
            target.width = size.width;
            target.height = size.height;
            const context = target.getContext('2d');
            if (!context) throw new Error('Camera preview context is unavailable.');
            context.clearRect(0, 0, size.width, size.height);
            drawFittedMediaLayer({
              context,
              displayScale: 1,
              fitMode: input.fitMode,
              frame: { x: 0, y: 0, ...size },
              cameraAppearance: input.appearance,
              shadowIntensity: 0,
              shadowMode: undefined,
              sourceWidth: media.videoWidth,
              sourceHeight: media.videoHeight,
              render: (x, y, width, height) =>
                drawCameraMediaSource(context, { x: 0, y: 0, ...size }, input.mirrored, () =>
                  context.drawImage(media, x, y, width, height)
                ),
            });
          }
          options.presenter.publish(output ?? null, () => {});
          accepted = true;
        } catch {
          if (!disposed && !signal.aborted && ticket === version) options.fail();
        } finally {
          if (output && !accepted) output.release();
          if (controller?.signal === signal) controller = null;
        }
      }
    } finally {
      running = false;
    }
  };
  const request = () => {
    if (disposed) return;
    version++;
    wanted = true;
    controller?.abort();
    if (!running) {
      running = true;
      void Promise.resolve()
        .then(drain)
        .catch(() => {
          if (!disposed) options.fail();
        });
    }
  };
  return {
    request,
    cancel,
    reset() {
      cancel();
      reset = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      gpu?.dispose();
      gpu = null;
    },
  };
}
