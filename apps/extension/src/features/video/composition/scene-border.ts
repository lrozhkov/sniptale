import type { QuickEditBorder } from '../project/scene/focus-appearance';
import { cameraTransitionProgress, type CameraTransition } from '../project/motion/transitions';

type SceneRect = QuickEditBorder['area'];

/** Evaluated retained animation time and phase policy, independent of timeline representation. */
export interface SceneBorderClock {
  time: number;
  duration: number;
  enter: CameraTransition;
  exit: CameraTransition;
}

export interface SceneBorderFrame {
  id: string;
  path: string;
  perimeter: number;
  width: number;
  color: string;
  style: QuickEditBorder['style'];
  start: number;
  end: number;
  opacity: number;
  /** Canvas dash offset in scene pixels; absent legacy frames are stationary. */
  dashOffset?: number;
}

function patternedBorderPath(rect: SceneRect, radius: number) {
  const { x, y, width, height } = rect;
  const points = [{ x: x + width / 2, y }];
  // Canvas measures curve lengths coarsely when dashing. Explicit chords keep
  // closure phase exact, with less than 0.025 output pixels of radial deviation.
  const steps = Math.max(4, Math.ceil((Math.PI / 2) * Math.sqrt(radius / 0.2)));
  const centers = [
    { x: x + width - radius, y: y + radius },
    { x: x + width - radius, y: y + height - radius },
    { x: x + radius, y: y + height - radius },
    { x: x + radius, y: y + radius },
  ];
  for (const [corner, center] of centers.entries()) {
    for (let step = 0; step <= steps; step++) {
      const angle = ((corner - 1 + step / steps) * Math.PI) / 2;
      points.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }
  }
  points.push(points[0]!);
  let perimeter = 0;
  for (let i = 1; i < points.length; i++)
    perimeter += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return {
    path: points.map((point, i) => `${i ? 'L' : 'M'}${point.x} ${point.y}`).join('') + 'Z',
    perimeter,
  };
}

/** Clockwise rounded path from top-center; patterned chords keep Canvas dash measurement exact. */
export function sceneBorderPath(rect: SceneRect, radius: number, patterned = false) {
  const { x, y, width: w, height: h } = rect;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  // Chromium resets stroke dashes at degenerate arcs, so square corners use lines.
  if (r === 0)
    return {
      path: `M${x + w / 2} ${y}H${x + w}V${y + h}H${x}V${y}H${x + w / 2}Z`,
      perimeter: 2 * (w + h),
    };
  if (patterned) return patternedBorderPath(rect, r);
  return {
    path:
      `M${x + w / 2} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
      `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
      `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
      `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w / 2}Z`,
    perimeter: 2 * (w + h - 4 * r) + 2 * Math.PI * r,
  };
}

function borderPhase(
  clock: SceneBorderClock,
  border: QuickEditBorder,
  geometry: { width: number; perimeter: number }
) {
  const { duration, enter, exit } = clock;
  const t = clock.time;
  const enterDuration = enter.type === 'none' ? 0 : enter.duration;
  const exitDuration = exit.type === 'none' ? 0 : exit.duration;
  const hold = Math.max(0, duration - enterDuration - exitDuration);
  const elapsed = Math.max(0, Math.min(t, duration - exitDuration) - enterDuration);
  const active = border.loop && hold > 0;
  const rotation =
    active &&
    (border.motion === 'clockwise' || border.motion === 'counterclockwise') &&
    border.style !== 'solid';
  const direction = border.motion === 'counterclockwise' ? -1 : 1;
  const pitch = geometry.width * (border.style === 'dashed' ? 5 : 2);
  const movement = rotation ? direction * elapsed * (2 / border.period) * pitch : 0;
  const holdInterval = () => {
    if (!rotation) return { start: 0, end: 1 };
    const shrink = Math.min(1, elapsed / Math.min(0.2, hold));
    const start = geometry.perimeter > 0 ? movement / geometry.perimeter : 0;
    return { start, end: start + 1 - (1 - border.segmentPercent / 100) * shrink };
  };
  let start = 0,
    end = 1,
    opacity = 1;
  if (t < enterDuration) {
    const p = cameraTransitionProgress(t / enterDuration, enter.type);
    if (border.reveal === 'draw') end = p;
    else if (border.reveal === 'draw-ccw') {
      start = -p;
      end = 0;
    } else opacity = p;
  } else {
    ({ start, end } = holdInterval());
    if (active && border.motion === 'pulse')
      opacity = 0.675 + 0.325 * Math.cos((2 * Math.PI * elapsed) / border.period);
    if (exitDuration > 0 && t > duration - exitDuration) {
      const p = cameraTransitionProgress((t - duration + exitDuration) / exitDuration, exit.type);
      if (border.exitReveal === 'erase') start += (end - start) * p;
      else if (border.exitReveal === 'erase-ccw') end -= (end - start) * p;
      else opacity *= 1 - p;
    }
  }
  const ripple = (elapsed / border.period) % 1;
  const edgeDuration = Math.min(0.2, hold / 2);
  const rippleEnvelope =
    active && border.motion === 'ripple' && edgeDuration > 0
      ? Math.max(0, Math.min(1, elapsed / edgeDuration, (hold - elapsed) / edgeDuration))
      : 0;
  const offset = Math.floor(start);
  return {
    start: start - offset,
    end: end - offset,
    opacity,
    movement,
    ripple,
    rippleOpacity: Math.sin(Math.PI * ripple) * 0.6 * rippleEnvelope,
  };
}

/** Samples one admitted border in local scene pixels, including its independent ripple. */
export function sampleSceneBorder(args: {
  id: string;
  border: QuickEditBorder;
  clock: SceneBorderClock;
  window: SceneRect;
  scale: number;
}): SceneBorderFrame[] {
  const border = args.border;
  const area = {
    x: args.window.x + border.area.x * args.window.width,
    y: args.window.y + border.area.y * args.window.height,
    width: border.area.width * args.window.width,
    height: border.area.height * args.window.height,
  };
  const width = Math.min(border.width * args.scale, area.width / 2, area.height / 2);
  const inset = width / 2;
  const rect = {
    x: area.x + inset,
    y: area.y + inset,
    width: Math.max(0, area.width - width),
    height: Math.max(0, area.height - width),
  };
  const radius = Math.max(0, Math.min(area.width, area.height) * border.roundness - inset);
  const path = sceneBorderPath(rect, radius, border.style !== 'solid');
  const phase = borderPhase(args.clock, border, { width, perimeter: path.perimeter });
  const primary: SceneBorderFrame = {
    id: args.id,
    ...path,
    width,
    color: border.color,
    style: border.style,
    start: phase.start,
    end: phase.end,
    opacity: phase.opacity,
    dashOffset: 0 - phase.movement,
  };
  if (phase.rippleOpacity <= 0) return [primary];
  const spread = phase.ripple * Math.max(12 * args.scale, width * 4);
  const outline = sceneBorderPath(
    {
      x: rect.x - spread,
      y: rect.y - spread,
      width: rect.width + 2 * spread,
      height: rect.height + 2 * spread,
    },
    radius + spread,
    border.style !== 'solid'
  );
  return [
    primary,
    {
      ...primary,
      ...outline,
      id: `${args.id}:ripple`,
      start: 0,
      end: 1,
      opacity: phase.rippleOpacity,
    },
  ];
}
