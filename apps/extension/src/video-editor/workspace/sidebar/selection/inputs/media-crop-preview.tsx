import type { DOMAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { MediaSourceCrop } from '../../../../../features/video/project/media-crop';
import { translate } from '../../../../../platform/i18n';
import { InspectorActionButton } from '../shared/actions';

interface MediaCropPreviewProps {
  url: string | undefined;
  kind: 'VIDEO' | 'IMAGE';
  width: number;
  height: number;
  sourceTime: number;
  crop: MediaSourceCrop;
  disabled: boolean;
  onChange: (crop: MediaSourceCrop) => void;
}

/** The preview consumes the existing asset URL; seeking does not reacquire or reload it. */
export function MediaCropPreview(props: MediaCropPreviewProps) {
  return renderMediaCropPreview(props, useMediaCropPreviewState(props));
}

function useMediaCropPreviewState(props: MediaCropPreviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const time = useRef(props.sourceTime);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<MediaSourceCrop | null>(null);
  const gesture = useRef<{
    pointer: number;
    x: number;
    y: number;
    width: number;
    height: number;
    crop: MediaSourceCrop;
    value: MediaSourceCrop;
  } | null>(null);
  useEffect(() => {
    time.current = props.sourceTime;
    if (video.current && video.current.readyState >= 1)
      video.current.currentTime = props.sourceTime;
  }, [props.sourceTime]);
  const cancel = () => {
    gesture.current = null;
    setDraft(null);
  };
  useEffect(() => {
    if (props.disabled) cancel();
  }, [props.disabled]);
  const crop = draft ?? props.crop;
  const move = (value: MediaSourceCrop, x: number, y: number): MediaSourceCrop => ({
    ...value,
    x: Math.min(1 - value.width, Math.max(0, value.x + x)),
    y: Math.min(1 - value.height, Math.max(0, value.y + y)),
  });
  const unavailable = status !== 'ready' || !props.url;
  return {
    video,
    time,
    status,
    setStatus,
    revision,
    setRevision,
    draft,
    setDraft,
    gesture,
    cancel,
    move,
    unavailable,
    crop,
  };
}

function renderMediaCropPreview(
  props: MediaCropPreviewProps,
  state: ReturnType<typeof useMediaCropPreviewState>
) {
  const { video, time, status, setStatus, revision, setRevision, gesture, unavailable, crop } =
    state;
  return (
    <div className="space-y-1" data-ui="video-editor.media-crop-preview">
      <button
        type="button"
        data-video-editor-local-navigation="true"
        aria-label={translate('videoEditor.sidebar.mediaCropPreview')}
        disabled={props.disabled || unavailable}
        className={`relative mx-auto block w-full max-h-44 touch-none overflow-hidden rounded-md
bg-[var(--sniptale-color-surface-muted)] outline-offset-2 disabled:cursor-default`}
        style={{
          aspectRatio: `${Math.max(1, props.width)} / ${Math.max(1, props.height)}`,
          maxWidth: `${(176 * Math.max(1, props.width)) / Math.max(1, props.height)}px`,
          cursor: gesture.current ? 'grabbing' : 'grab',
        }}
        {...createMediaCropGestureHandlers(props, state)}
      >
        {props.kind === 'VIDEO' ? (
          <video
            key={revision}
            ref={video}
            src={props.url}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain pointer-events-none"
            onLoadedMetadata={() => {
              if (video.current) video.current.currentTime = time.current;
            }}
            onLoadedData={() => setStatus('ready')}
            onError={() => setStatus('failed')}
          />
        ) : (
          <img
            key={revision}
            src={props.url}
            alt=""
            className="absolute inset-0 h-full w-full object-contain pointer-events-none"
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('failed')}
          />
        )}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full pointer-events-none"
        >
          <path
            d={[
              `M0 0H100V100H0Z M${crop.x * 100} ${crop.y * 100}`,
              `h${crop.width * 100}v${crop.height * 100}h${-crop.width * 100}Z`,
            ].join(' ')}
            fill="black"
            fillOpacity="0.55"
            fillRule="evenodd"
          />
          <rect
            x={crop.x * 100}
            y={crop.y * 100}
            width={crop.width * 100}
            height={crop.height * 100}
            fill="none"
            stroke="white"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {unavailable ? (
          <span
            className={`absolute inset-0 flex items-center justify-center p-2 text-xs
text-[var(--sniptale-color-text-secondary)]`}
          >
            {translate(
              status === 'failed' || !props.url
                ? 'videoEditor.sidebar.framingPreviewFailed'
                : 'videoEditor.sidebar.framingPreviewLoading'
            )}
          </span>
        ) : null}
      </button>
      {status === 'failed' && props.url ? (
        <InspectorActionButton
          onClick={() => {
            setStatus('loading');
            setRevision((value) => value + 1);
          }}
        >
          {translate('common.actions.retry')}
        </InspectorActionButton>
      ) : null}
    </div>
  );
}

/** Gesture adapters retain the preview component's refs and one commit/cancel lifetime. */
function createMediaCropGestureHandlers(
  props: MediaCropPreviewProps,
  state: Pick<
    ReturnType<typeof useMediaCropPreviewState>,
    'gesture' | 'cancel' | 'move' | 'setDraft' | 'unavailable'
  >
): Pick<
  DOMAttributes<HTMLButtonElement>,
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onLostPointerCapture'
  | 'onKeyDown'
> {
  const { gesture, cancel, move, setDraft, unavailable } = state;
  return {
    onPointerDown: (event) => {
      if (event.button !== 0 || props.disabled || unavailable) return;
      const box = event.currentTarget.getBoundingClientRect();
      gesture.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: box.width,
        height: box.height,
        crop: props.crop,
        value: props.crop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      event.preventDefault();
    },
    onPointerMove: (event) => {
      const start = gesture.current;
      if (!start || start.pointer !== event.pointerId) return;
      start.value = move(
        start.crop,
        (event.clientX - start.x) / Math.max(1, start.width),
        (event.clientY - start.y) / Math.max(1, start.height)
      );
      setDraft(start.value);
    },
    onPointerUp: (event) => {
      const start = gesture.current;
      if (!start || start.pointer !== event.pointerId) return;
      cancel();
      event.currentTarget.releasePointerCapture(event.pointerId);
      if (!props.disabled && (start.value.x !== props.crop.x || start.value.y !== props.crop.y))
        props.onChange(start.value);
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        cancel();
        event.stopPropagation();
        return;
      }
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = directions[event.key];
      if (!delta || props.disabled || unavailable) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 0.001 : 0.01;
      props.onChange(move(props.crop, delta[0] * step, delta[1] * step));
    },
  };
}
