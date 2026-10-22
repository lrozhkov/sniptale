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
  findEmbeddedCameraDockPosition,
  getEmbeddedCameraDockPosition,
  getEmbeddedCameraDockPositions,
  getEmbeddedCameraDockMarker,
  getEmbeddedCameraResizeCorner,
  resizeEmbeddedCameraGeometry,
  type EmbeddedCameraGeometry,
} from './geometry';
import { useEmbeddedCameraPeer } from './peer';
import { translate } from '../../../../platform/i18n';
import {
  webcamFrameStyle,
  webcamVideoStyle,
} from '../../../../features/video/recording/webcam-presentation';

const DRAG_THRESHOLD = 4;

function cameraViewport() {
  return {
    width: Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth),
    height: Math.min(
      window.innerHeight,
      document.documentElement.clientHeight || window.innerHeight
    ),
  };
}

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
  const revisionRef = useRef(0);
  useEffect(() => {
    if (!configuredGeometry || dragRef.current) return;
    geometryRef.current = configuredGeometry;
    setGeometry(configuredGeometry);
  }, [configuredGeometry]);

  const update = (next: EmbeddedCameraGeometry) => {
    const viewport = cameraViewport();
    const moving = dragRef.current && !dragRef.current.resizing;
    const positioned =
      moving && !next.freePlacement
        ? { ...next, dockPosition: findEmbeddedCameraDockPosition(next, viewport) }
        : next;
    const constrained = constrainEmbeddedCameraGeometry(
      positioned,
      viewport,
      !dragRef.current || dragRef.current.resizing
    );
    geometryRef.current = constrained;
    setGeometry(constrained);
  };
  const finish = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag || !onGeometryChange) return;
    update(geometryRef.current);
    const revision = revisionRef.current;
    void Promise.resolve(onGeometryChange(geometryRef.current)).catch(() => {
      if (revisionRef.current === revision) update(drag.origin);
    });
  };
  const cancel = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (drag) update(drag.origin);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    revisionRef.current += 1;
    event.currentTarget.setPointerCapture(event.pointerId);
    const resizing =
      event.target instanceof Element && event.target.closest('[data-resize="true"]') !== null;
    setDragging(true);
    const origin = constrainEmbeddedCameraGeometry(geometry, cameraViewport());
    geometryRef.current = origin;
    setGeometry(origin);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      resizing,
      resizeCorner: resizing ? getEmbeddedCameraResizeCorner(origin) : null,
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
          cameraViewport()
        )
      );
      return;
    }
    setDragging(true);
    update({
      ...drag.origin,
      center: {
        x: drag.origin.center.x + dx / cameraViewport().width,
        y: drag.origin.center.y + dy / cameraViewport().height,
      },
    });
  };
  return {
    dragging,
    moving: dragging && !dragRef.current?.resizing,
    cancel,
    finish,
    geometry,
    onPointerDown,
    onPointerMove,
  };
}

function CameraMedia(props: {
  geometry: EmbeddedCameraGeometry;
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
        ...webcamVideoStyle(props.geometry),
      }}
    />
  );
}

function CameraResizeHandle(props: {
  dragging: boolean;
  hovered: boolean;
  geometry: EmbeddedCameraGeometry;
}) {
  const { shape } = props.geometry;
  const corner = getEmbeddedCameraResizeCorner(props.geometry);
  const inset = shape === 'circle' || shape === 'ellipse' ? 'max(0px, calc(14.65% - 12px))' : '4px';
  return (
    <ProductGlassIconButton
      type="button"
      aria-label={translate('content.toolbar.videoRecordingCameraResize')}
      title={translate('content.toolbar.videoRecordingCameraResize')}
      data-resize="true"
      data-corner={corner}
      style={{
        position: 'absolute',
        width: 24,
        height: 24,
        minWidth: 24,
        padding: 0,
        background: 'var(--sniptale-color-surface-canvas)',
        border: '1px solid var(--sniptale-color-border-strong)',
        cursor: props.dragging ? 'grabbing' : 'grab',
        outlineStyle: 'solid',
        transition: 'opacity 120ms ease',
        [corner.includes('n') ? 'top' : 'bottom']: inset,
        [corner.includes('w') ? 'left' : 'right']: inset,
      }}
      className={[
        props.dragging || props.hovered ? 'opacity-100' : 'opacity-0',
        'outline-2 outline-offset-2 outline-transparent',
        'group-hover:opacity-100 focus-visible:opacity-100',
        'focus-visible:outline-[var(--sniptale-color-accent)]',
      ].join(' ')}
    >
      <MoveDiagonal2
        size={16}
        strokeWidth={1.75}
        style={{
          cursor: 'inherit',
          pointerEvents: 'none',
          transform: corner === 'ne' || corner === 'sw' ? 'rotate(90deg)' : undefined,
        }}
      />
    </ProductGlassIconButton>
  );
}

function CameraDockingGuides({ geometry }: { geometry: EmbeddedCameraGeometry }) {
  const viewport = cameraViewport();
  const contrast = 'var(--sniptale-color-surface-contrast)';
  return (
    <div
      aria-hidden
      data-ui="content.video-recording.camera-dock-guides"
      data-floating-ui-capture-transient="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483641 }}
    >
      {getEmbeddedCameraDockPositions(viewport).map((position) => {
        const active = getEmbeddedCameraDockPosition(geometry) === position;
        const target = getEmbeddedCameraDockMarker(geometry, position, viewport);
        const borderColor = `color-mix(in srgb, ${contrast} ${active ? 40 : 65}%, var(--sniptale-color-text-inverse))`;
        return (
          <div
            key={position}
            data-ui={`content.video-recording.camera-dock.${position}`}
            data-active={active}
            style={{
              position: 'absolute',
              left: target.center.x * viewport.width,
              top: target.center.y * viewport.height,
              transform: 'translate(-50%, -50%)',
              width: target.width,
              height: target.height,
              ...webcamFrameStyle(geometry),
              filter: undefined,
              border: `${active ? 2 : 1}px ${active ? 'solid' : 'dashed'} ${borderColor}`,
              outline: `1px solid color-mix(in srgb, ${contrast} 24%, transparent)`,
              background: `color-mix(in srgb, ${contrast} ${active ? 10 : 4}%, transparent)`,
            }}
          />
        );
      })}
    </div>
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
  const cameraRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!enabled || !props.interactive) return;
    const move = (event: PointerEvent) => {
      const bounds = cameraRef.current?.getBoundingClientRect();
      setHovered(
        Boolean(
          bounds &&
          event.clientX >= bounds.left - 12 &&
          event.clientX <= bounds.right + 12 &&
          event.clientY >= bounds.top - 12 &&
          event.clientY <= bounds.bottom + 12
        )
      );
    };
    const leave = () => setHovered(false);
    document.addEventListener('pointermove', move, true);
    window.addEventListener('blur', leave);
    return () => {
      document.removeEventListener('pointermove', move, true);
      window.removeEventListener('blur', leave);
    };
  }, [enabled, props.interactive]);
  const [, setViewportRevision] = useState(0);
  useEffect(() => {
    const updateViewport = () => setViewportRevision((revision) => revision + 1);
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateViewport);
    observer?.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      observer?.disconnect();
    };
  }, []);
  useEffect(() => setPeerError(false), [enabled, onOffer]);
  const interaction = useEmbeddedCameraGeometry(
    configuredGeometry,
    props.interactive,
    props.onGeometryChange
  );
  const geometry = constrainEmbeddedCameraGeometry(
    interaction.geometry,
    cameraViewport(),
    !interaction.moving
  );
  const handlePeerError = useCallback(() => setPeerError(true), []);
  const stream = useEmbeddedCameraPeer({
    enabled,
    onError: handlePeerError,
    ...(props.peerGeneration === undefined ? {} : { peerGeneration: props.peerGeneration }),
    ...(onOffer ? { onOffer } : {}),
    ...(onPeerClose ? { onPeerClose } : {}),
  });
  if (!enabled) return null;
  const viewport = cameraViewport();
  const shortSide = Math.min(viewport.width, viewport.height);
  const width = geometry.sizeFraction * shortSide;
  const height = geometry.shape === 'circle' ? width : width * (9 / 16);
  return (
    <>
      <div
        ref={cameraRef}
        className="group"
        data-ui="content.video-recording.embedded-camera"
        tabIndex={props.interactive ? 0 : -1}
        style={{
          position: 'fixed',
          boxSizing: 'border-box',
          zIndex: 2147483640,
          left: geometry.center.x * viewport.width,
          top: geometry.center.y * viewport.height,
          width,
          height,
          transform: 'translate(-50%, -50%)',
          borderRadius: webcamFrameStyle(geometry).borderRadius,
          pointerEvents: props.interactive ? 'auto' : 'none',
          cursor: props.interactive ? (interaction.dragging ? 'grabbing' : 'grab') : 'default',
          filter: webcamFrameStyle(geometry).filter,
          touchAction: 'none',
        }}
        onPointerDown={interaction.onPointerDown}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.finish}
        onPointerCancel={interaction.cancel}
        onLostPointerCapture={interaction.cancel}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            ...webcamFrameStyle(geometry),
            filter: undefined,
            background: 'var(--sniptale-color-surface-elevated, #18181b)',
            border: '2px solid color-mix(in srgb, white 75%, transparent)',
            boxSizing: 'border-box',
          }}
        >
          <CameraMedia geometry={geometry} error={peerError} stream={stream} width={width} />
        </div>
        {props.interactive && (
          <CameraResizeHandle
            dragging={interaction.dragging}
            hovered={hovered}
            geometry={geometry}
          />
        )}
      </div>
      {interaction.moving && !geometry.freePlacement ? (
        <CameraDockingGuides geometry={geometry} />
      ) : null}
    </>
  );
}
