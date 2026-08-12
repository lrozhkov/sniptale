import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Video } from 'lucide-react';
import {
  constrainEmbeddedCameraGeometry,
  DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
  resizeEmbeddedCameraGeometry,
  type EmbeddedCameraGeometry,
} from './geometry';
import { useEmbeddedCameraPeer } from './peer';

const DRAG_THRESHOLD = 4;

type CameraDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: EmbeddedCameraGeometry;
  resizing: boolean;
  resizeCorner: 'nw' | 'ne' | 'se' | 'sw' | null;
};

function useEmbeddedCameraGeometry(
  configuredGeometry: EmbeddedCameraGeometry | undefined,
  interactive: boolean,
  onGeometryChange: ((geometry: EmbeddedCameraGeometry) => void) | undefined
) {
  const [geometry, setGeometry] = useState(configuredGeometry ?? DEFAULT_EMBEDDED_CAMERA_GEOMETRY);
  const geometryRef = useRef(geometry);
  const dragRef = useRef<CameraDrag | null>(null);
  useEffect(() => {
    if (!configuredGeometry || dragRef.current) return;
    geometryRef.current = configuredGeometry;
    setGeometry(configuredGeometry);
  }, [configuredGeometry]);

  const update = (next: EmbeddedCameraGeometry) => {
    const constrained = constrainEmbeddedCameraGeometry(next, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    geometryRef.current = constrained;
    setGeometry(constrained);
  };
  const finish = () => {
    dragRef.current = null;
    onGeometryChange?.(geometryRef.current);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = event.target as HTMLElement;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: geometry,
      resizing: target.dataset['resize'] === 'true',
      resizeCorner: (target.dataset['corner'] as CameraDrag['resizeCorner'] | undefined) ?? null,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (drag.resizing) {
      update(
        resizeEmbeddedCameraGeometry(
          drag.origin,
          drag.resizeCorner ?? 'se',
          { x: dx, y: dy },
          { width: window.innerWidth, height: window.innerHeight }
        )
      );
      return;
    }
    update({
      ...drag.origin,
      center: {
        x: drag.origin.center.x + dx / window.innerWidth,
        y: drag.origin.center.y + dy / window.innerHeight,
      },
    });
  };
  return { finish, geometry, onPointerDown, onPointerMove };
}

function CameraMedia(props: {
  cropOffset: EmbeddedCameraGeometry['cropOffset'];
  stream: MediaStream | null;
  width: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = props.stream;
  }, [props.stream]);
  if (!props.stream) {
    return (
      <div className="flex h-full w-full items-center justify-center text-white/70">
        <Video size={Math.max(18, props.width * 0.2)} />
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: `${50 + props.cropOffset.x * 50}% ${50 + props.cropOffset.y * 50}%`,
      }}
    />
  );
}

function CameraResizeHandles() {
  return (['nw', 'ne', 'se', 'sw'] as const).map((corner) => (
    <span
      key={corner}
      data-resize="true"
      data-corner={corner}
      style={{
        position: 'absolute',
        width: 12,
        height: 12,
        background: 'white',
        borderRadius: 6,
        transition: 'opacity 120ms ease',
        ...(corner.includes('n') ? { top: 4 } : { bottom: 4 }),
        ...(corner.includes('w') ? { left: 4 } : { right: 4 }),
      }}
      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
    />
  ));
}

export function EmbeddedRecordingCamera(props: {
  enabled: boolean;
  geometry?: EmbeddedCameraGeometry;
  interactive: boolean;
  onGeometryChange?: (geometry: EmbeddedCameraGeometry) => void;
  onOffer?: (sdp: string) => Promise<string>;
  onPeerClose?: () => Promise<void> | void;
}) {
  const { enabled, geometry: configuredGeometry, onOffer, onPeerClose } = props;
  const interaction = useEmbeddedCameraGeometry(
    configuredGeometry,
    props.interactive,
    props.onGeometryChange
  );
  const { geometry } = interaction;
  const stream = useEmbeddedCameraPeer({
    enabled,
    ...(onOffer ? { onOffer } : {}),
    ...(onPeerClose ? { onPeerClose } : {}),
  });
  if (!enabled) return null;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const width = geometry.sizeFraction * shortSide;
  const height = geometry.shape === 'circle' ? width : width * (9 / 16);
  return (
    <div
      className="group"
      data-ui="content.video-recording.embedded-camera"
      tabIndex={props.interactive ? 0 : -1}
      style={{
        position: 'fixed',
        zIndex: 2147483640,
        left: geometry.center.x * window.innerWidth,
        top: geometry.center.y * window.innerHeight,
        width,
        height,
        transform: 'translate(-50%, -50%)',
        borderRadius: geometry.shape === 'circle' ? '999px' : '12px',
        overflow: 'hidden',
        pointerEvents: props.interactive ? 'auto' : 'none',
        cursor: props.interactive ? 'grab' : 'default',
        background: 'var(--sniptale-color-surface-elevated, #18181b)',
        border: '2px solid color-mix(in srgb, white 75%, transparent)',
        boxShadow: '0 8px 28px rgba(0,0,0,.3)',
        touchAction: 'none',
      }}
      onPointerDown={interaction.onPointerDown}
      onPointerMove={interaction.onPointerMove}
      onPointerUp={interaction.finish}
      onPointerCancel={interaction.finish}
    >
      <CameraMedia cropOffset={geometry.cropOffset} stream={stream} width={width} />
      <CameraResizeHandles />
    </div>
  );
}
