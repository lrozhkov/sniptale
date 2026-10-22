import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { MoveDiagonal2, Video } from 'lucide-react';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls/controls';
import {
  constrainEmbeddedCameraGeometry,
  DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
  resizeEmbeddedCameraGeometry,
  type EmbeddedCameraGeometry,
} from './geometry';
import { useEmbeddedCameraPeer } from './peer';
import { translate } from '../../../../platform/i18n';

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
  onGeometryChange: ((geometry: EmbeddedCameraGeometry) => Promise<void> | void) | undefined
) {
  const [geometry, setGeometry] = useState(configuredGeometry ?? DEFAULT_EMBEDDED_CAMERA_GEOMETRY);
  const [dragging, setDragging] = useState(false);
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
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag || !onGeometryChange) return;
    void Promise.resolve(onGeometryChange(geometryRef.current)).catch(() => update(drag.origin));
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const resizing =
      event.target instanceof Element && event.target.closest('[data-resize="true"]') !== null;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: geometry,
      resizing,
      resizeCorner: resizing ? 'se' : null,
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
    setDragging(true);
    update({
      ...drag.origin,
      center: {
        x: drag.origin.center.x + dx / window.innerWidth,
        y: drag.origin.center.y + dy / window.innerHeight,
      },
    });
  };
  return { dragging, finish, geometry, onPointerDown, onPointerMove };
}

function CameraMedia(props: {
  cropOffset: EmbeddedCameraGeometry['cropOffset'];
  error: boolean;
  stream: MediaStream | null;
  width: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = props.stream;
  }, [props.stream]);
  if (props.error) {
    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-white/80"
      >
        <Video size={Math.max(18, props.width * 0.18)} />
        <span>{translate('content.toolbar.videoRecordingCameraPreviewUnavailable')}</span>
      </div>
    );
  }
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

function CameraResizeHandle(props: { shape: EmbeddedCameraGeometry['shape'] }) {
  const inset = props.shape === 'circle' ? 'max(0px, calc(14.65% - 12px))' : '4px';
  return (
    <ProductGlassIconButton
      type="button"
      aria-label={translate('content.toolbar.videoRecordingCameraResize')}
      title={translate('content.toolbar.videoRecordingCameraResize')}
      data-resize="true"
      data-corner="se"
      style={{
        position: 'absolute',
        width: 24,
        height: 24,
        minWidth: 24,
        padding: 0,
        background: 'var(--sniptale-color-surface-canvas)',
        border: '1px solid var(--sniptale-color-border-strong)',
        cursor: 'nwse-resize',
        outlineStyle: 'solid',
        transition: 'opacity 120ms ease',
        bottom: inset,
        right: inset,
      }}
      className={[
        'opacity-0 outline-2 outline-offset-2 outline-transparent',
        'group-hover:opacity-100 group-focus-within:opacity-100',
        'focus-visible:outline-[var(--sniptale-color-accent)]',
      ].join(' ')}
    >
      <MoveDiagonal2 size={16} strokeWidth={1.75} />
    </ProductGlassIconButton>
  );
}

export function EmbeddedRecordingCamera(props: {
  enabled: boolean;
  geometry?: EmbeddedCameraGeometry;
  interactive: boolean;
  peerGeneration?: number;
  onGeometryChange?: (geometry: EmbeddedCameraGeometry) => Promise<void> | void;
  onOffer?: (sdp: string) => Promise<string>;
  onPeerClose?: () => Promise<void> | void;
}) {
  const { enabled, geometry: configuredGeometry, onOffer, onPeerClose } = props;
  const [peerError, setPeerError] = useState(false);
  const [, setViewportRevision] = useState(0);
  useEffect(() => {
    const updateViewport = () => setViewportRevision((revision) => revision + 1);
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);
  useEffect(() => setPeerError(false), [enabled, onOffer]);
  const interaction = useEmbeddedCameraGeometry(
    configuredGeometry,
    props.interactive,
    props.onGeometryChange
  );
  const geometry = constrainEmbeddedCameraGeometry(interaction.geometry, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const handlePeerError = useCallback(() => setPeerError(true), []);
  const stream = useEmbeddedCameraPeer({
    enabled,
    onError: handlePeerError,
    ...(props.peerGeneration === undefined ? {} : { peerGeneration: props.peerGeneration }),
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
        pointerEvents: props.interactive ? 'auto' : 'none',
        cursor: props.interactive ? (interaction.dragging ? 'grabbing' : 'grab') : 'default',
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
      <div style={{ width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden' }}>
        <CameraMedia
          cropOffset={geometry.cropOffset}
          error={peerError}
          stream={stream}
          width={width}
        />
      </div>
      {props.interactive && <CameraResizeHandle shape={geometry.shape} />}
    </div>
  );
}
