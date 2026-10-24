import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { serializePaintToCss, type Gradient } from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';

const CANVAS_HANDLE_CLASS_NAME = [
  'absolute z-10 grid min-h-0! -translate-x-1/2 -translate-y-1/2 cursor-crosshair',
  'place-items-center rounded-full border-0! bg-transparent! p-0! outline-none',
  'focus-visible:outline-1 focus-visible:outline-white',
].join(' ');

type Handle = 'center' | 'direction' | 'start' | 'radius-x' | 'radius-y';
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const angle = (value: number) => ((Math.round(value) % 360) + 360) % 360;
const centerOf = (gradient: Gradient) =>
  gradient.type === 'linear' ? { x: 0.5, y: 0.5 } : gradient.center;
const angleOf = (gradient: Gradient) =>
  gradient.type === 'linear' ? gradient.angle : gradient.type === 'conic' ? gradient.startAngle : 0;
const withAngle = (gradient: Gradient, value: number): Gradient =>
  gradient.type === 'linear'
    ? { ...gradient, angle: angle(value) }
    : gradient.type === 'conic'
      ? { ...gradient, startAngle: angle(value) }
      : gradient;

interface CanvasDrag {
  kind: Handle;
  target: HTMLButtonElement;
  pointerId: number;
  x: number;
  y: number;
  rect: DOMRect;
  initial: Gradient;
  bearing: number;
  styles: HTMLStyleElement[];
}
interface CanvasSize {
  width: number;
  height: number;
}

function useCanvasSize(canvas: RefObject<HTMLDivElement | null>, compact: boolean) {
  const [size, setSize] = useState({ width: 294, height: compact ? 80 : 106 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvas]);
  return size;
}

function moveCanvasHandle(
  active: CanvasDrag,
  event: PointerEvent<HTMLButtonElement>,
  latest: Gradient
): Gradient {
  const { initial, kind, rect } = active;
  if (kind === 'center' && latest.type !== 'linear') {
    return {
      ...latest,
      center: {
        x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)),
        y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)),
      },
    };
  }
  if (
    (kind === 'radius-x' || kind === 'radius-y') &&
    latest.type === 'radial' &&
    initial.type === 'radial'
  ) {
    const axis = kind === 'radius-x' ? 'x' : 'y';
    const delta =
      axis === 'x'
        ? (event.clientX - active.x) / Math.max(1, rect.width)
        : (event.clientY - active.y) / Math.max(1, rect.height);
    const sign = initial.center[axis] <= 0.5 ? 1 : -1;
    return {
      ...latest,
      radius: { ...latest.radius, [axis]: clamp(initial.radius[axis] + delta * sign, 0.01) },
    };
  }
  if (kind === 'direction' || kind === 'start') {
    const center = centerOf(initial);
    const bearing =
      (Math.atan2(
        event.clientX - rect.left - center.x * rect.width,
        -(event.clientY - rect.top - center.y * rect.height)
      ) *
        180) /
      Math.PI;
    const value = angleOf(initial) + bearing - active.bearing;
    return withAngle(latest, event.shiftKey ? Math.round(value / 15) * 15 : value);
  }
  return latest;
}

function useCanvasDrag(
  gradient: Gradient,
  onChange: (gradient: Gradient) => void,
  canvas: RefObject<HTMLDivElement | null>
) {
  const current = useRef({ gradient, onChange });
  current.current = { gradient, onChange };
  const drag = useRef<CanvasDrag | null>(null);
  const finish = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    active.styles.forEach((style) => style.remove());
    if (active.target.hasPointerCapture?.(active.pointerId))
      active.target.releasePointerCapture(active.pointerId);
  };
  useEffect(() => () => finish(), [gradient.type]);
  useEffect(() => {
    const end = (event: Event) => {
      if ('pointerId' in event && drag.current && event.pointerId !== drag.current.pointerId)
        return;
      finish();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', end);
    return () => {
      finish();
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', end);
    };
  }, []);
  const begin = (event: PointerEvent<HTMLButtonElement>, kind: Handle) => {
    if (event.button !== 0 || event.isPrimary === false || !canvas.current) return;
    event.preventDefault();
    event.stopPropagation();
    finish();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvas.current.getBoundingClientRect();
    const center = centerOf(gradient);
    const style = document.createElement('style');
    style.textContent = '*{cursor:none!important}';
    document.head.append(style);
    const styles = [style];
    const root = event.currentTarget.getRootNode();
    if (root instanceof ShadowRoot) {
      const scoped = style.cloneNode(true);
      if (scoped instanceof HTMLStyleElement) {
        root.append(scoped);
        styles.push(scoped);
      }
    }
    drag.current = {
      kind,
      target: event.currentTarget,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect,
      initial: gradient,
      bearing:
        (Math.atan2(
          event.clientX - rect.left - center.x * rect.width,
          -(event.clientY - rect.top - center.y * rect.height)
        ) *
          180) /
        Math.PI,
      styles,
    };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const { gradient: latest, onChange: change } = current.current;
    change(moveCanvasHandle(active, event, latest));
  };
  return { begin, move, finish };
}

function handleCanvasKey(
  gradient: Gradient,
  onChange: (gradient: Gradient) => void,
  event: KeyboardEvent<HTMLButtonElement>,
  kind: Handle
) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const sign = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
  if (kind === 'center' && gradient.type !== 'linear') {
    const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : 'y';
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    onChange({
      ...gradient,
      center: {
        ...gradient.center,
        [axis]: clamp(gradient.center[axis] + direction * (event.shiftKey ? 0.1 : 0.01)),
      },
    });
  } else if ((kind === 'radius-x' || kind === 'radius-y') && gradient.type === 'radial') {
    const axis = kind === 'radius-x' ? 'x' : 'y';
    onChange({
      ...gradient,
      radius: {
        ...gradient.radius,
        [axis]: clamp(gradient.radius[axis] + sign * (event.shiftKey ? 0.15 : 0.01), 0.01),
      },
    });
  } else onChange(withAngle(gradient, angleOf(gradient) + sign * (event.shiftKey ? 15 : 1)));
}

function CanvasHandle({
  kind,
  x,
  y,
  label,
  value,
  controls,
  gradient,
  onChange,
}: {
  kind: Handle;
  x: number;
  y: number;
  label: string;
  value?: number;
  controls: ReturnType<typeof useCanvasDrag>;
  gradient: Gradient;
  onChange: (gradient: Gradient) => void;
}) {
  return (
    <button
      key={kind}
      type="button"
      data-gradient-handle={kind}
      aria-label={label}
      {...(value === undefined
        ? {}
        : {
            role: 'slider',
            'aria-valuenow': value,
            'aria-valuemin': kind.startsWith('radius') ? 1 : 0,
            'aria-valuemax': kind.startsWith('radius') ? 100 : 359,
          })}
      className={CANVAS_HANDLE_CLASS_NAME}
      style={{
        width: kind === 'center' ? 28 : 24,
        height: kind === 'center' ? 28 : 24,
        left: `clamp(10px, ${x * 100}%, calc(100% - 10px))`,
        top: `clamp(10px, ${y * 100}%, calc(100% - 10px))`,
      }}
      onPointerDown={(event) => controls.begin(event, kind)}
      onPointerMove={controls.move}
      onLostPointerCapture={controls.finish}
      onKeyDown={(event) => handleCanvasKey(gradient, onChange, event, kind)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none block rounded-full border-2 border-white bg-transparent"
        style={{
          width: kind === 'start' ? 8 : kind === 'center' ? 16 : 12,
          height: kind === 'start' ? 8 : kind === 'center' ? 16 : 12,
          boxShadow: '0 0 0 1px #0009, inset 0 0 0 1px #0005',
        }}
      />
    </button>
  );
}

function CanvasGuides({ gradient, size }: { gradient: Gradient; size: CanvasSize }) {
  const center = centerOf(gradient);
  const radians = (angleOf(gradient) * Math.PI) / 180;
  const arm = Math.min(size.width, size.height) * 0.36;
  const dx = (Math.sin(radians) * arm) / size.width;
  const dy = (Math.cos(radians) * arm) / size.height;
  return gradient.type === 'radial' ? (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      style={{ opacity: 0.7, filter: 'drop-shadow(0 1px 1px #0008)' }}
    >
      <line
        x1={center.x * size.width}
        y1={center.y * size.height}
        x2={(center.x + (center.x <= 0.5 ? 1 : -1) * gradient.radius.x) * size.width}
        y2={center.y * size.height}
        stroke="white"
        strokeWidth="1"
      />
      <line
        x1={center.x * size.width}
        y1={center.y * size.height}
        x2={center.x * size.width}
        y2={(center.y + (center.y <= 0.5 ? 1 : -1) * gradient.radius.y) * size.height}
        stroke="white"
        strokeWidth="1"
      />
      <ellipse
        className="opacity-0 group-hover:opacity-75 group-focus-within:opacity-75"
        cx={center.x * size.width}
        cy={center.y * size.height}
        rx={gradient.radius.x * size.width}
        ry={gradient.radius.y * size.height}
        fill="none"
        stroke="white"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      style={{ opacity: 0.7, filter: 'drop-shadow(0 1px 1px #0008)' }}
    >
      <line
        x1={(center.x - (gradient.type === 'linear' ? dx : 0)) * size.width}
        y1={(center.y + (gradient.type === 'linear' ? dy : 0)) * size.height}
        x2={(center.x + dx) * size.width}
        y2={(center.y - dy) * size.height}
        stroke="white"
        strokeWidth="1"
      />
    </svg>
  );
}

function canvasHandles(gradient: Gradient, size: CanvasSize) {
  const center = centerOf(gradient);
  const radians = (angleOf(gradient) * Math.PI) / 180;
  const arm = Math.min(size.width, size.height) * 0.36;
  const dx = (Math.sin(radians) * arm) / size.width;
  const dy = (Math.cos(radians) * arm) / size.height;
  const handles: { kind: Handle; x: number; y: number; label: string; value?: number }[] = [];
  if (gradient.type !== 'linear')
    handles.push({
      kind: 'center',
      x: center.x,
      y: center.y,
      label: [
        translate('highlighter.paintPicker.centerX'),
        translate('highlighter.paintPicker.centerY'),
      ].join(', '),
    });
  if (gradient.type === 'radial') {
    for (const axis of ['x', 'y'] as const)
      handles.push({
        kind: axis === 'x' ? 'radius-x' : 'radius-y',
        x: center.x + (axis === 'x' ? (center.x <= 0.5 ? 1 : -1) * gradient.radius.x : 0),
        y: center.y + (axis === 'y' ? (center.y <= 0.5 ? 1 : -1) * gradient.radius.y : 0),
        label: translate(
          axis === 'x' ? 'highlighter.paintPicker.radiusX' : 'highlighter.paintPicker.radiusY'
        ),
        value: Math.round(gradient.radius[axis] * 100),
      });
  } else {
    handles.push({
      kind: 'direction',
      x: center.x + dx,
      y: center.y - dy,
      label: translate(
        gradient.type === 'linear'
          ? 'highlighter.paintPicker.directionEnd'
          : 'highlighter.paintPicker.startAngle'
      ),
      value: angleOf(gradient),
    });
    if (gradient.type === 'linear')
      handles.push({
        kind: 'start',
        x: center.x - dx,
        y: center.y + dy,
        label: translate('highlighter.paintPicker.directionStart'),
        value: gradient.angle,
      });
  }
  return handles;
}

/** Geometry preview and keyboard alternatives share the canonical gradient draft. */
export function GradientCanvas({
  gradient,
  onChange,
  compact = false,
}: {
  gradient: Gradient;
  onChange: (gradient: Gradient) => void;
  compact?: boolean;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const size = useCanvasSize(canvas, compact);
  const controls = useCanvasDrag(gradient, onChange, canvas);
  const handles = canvasHandles(gradient, size);
  return (
    <div
      ref={canvas}
      data-ui="shared.ui.paint-selector.canvas"
      className="group relative min-w-0 touch-none overflow-hidden rounded-[4px]"
      style={{
        height: compact ? 80 : 106,
        backgroundColor: '#eee',
        backgroundImage:
          'conic-gradient(#c4c4c4 25%, transparent 0 50%, #c4c4c4 0 75%, transparent 0)',
        backgroundSize: '12px 12px',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: serializePaintToCss({ kind: 'gradient', gradient }) }}
      />
      <CanvasGuides gradient={gradient} size={size} />
      {handles.map((handle) => (
        <CanvasHandle
          key={handle.kind}
          {...handle}
          controls={controls}
          gradient={gradient}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
