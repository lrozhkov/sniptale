import { parsePaint, serializePaintToCss, type LinearGradient } from '@sniptale/foundation/paint';
import type { EditorFrameSettings } from './types';
import {
  createEditorGradientCssStops,
  createEditorGradientColorStopColor,
  createEditorGradientFallbackStops,
  normalizeEditorGradientColorList,
  normalizeEditorGradientStops,
  type EditorGradientColorStop,
} from './gradient';

type FrameGradientSource = Pick<
  EditorFrameSettings,
  | 'backgroundGradientColorStops'
  | 'backgroundGradientFrom'
  | 'backgroundGradientTo'
  | 'backgroundGradientStops'
>;

export function normalizeEditorFrameGradientStops(frame: FrameGradientSource): string[] {
  const storedStops = Array.isArray(frame.backgroundGradientStops)
    ? frame.backgroundGradientStops.filter((color) => typeof color === 'string' && color.length > 0)
    : [];

  return storedStops.length >= 2
    ? storedStops
    : [frame.backgroundGradientFrom, frame.backgroundGradientTo];
}

export function createEditorFrameGradientPatch(
  frame: FrameGradientSource,
  stops: readonly string[] | readonly EditorGradientColorStop[]
): Pick<
  EditorFrameSettings,
  | 'backgroundGradientColorStops'
  | 'backgroundGradientFrom'
  | 'backgroundGradientTo'
  | 'backgroundGradientStops'
  | 'backgroundGradient'
> {
  const normalizedColorStops = normalizeEditorFrameGradientPatchStops(frame, stops);
  const normalizedStops = normalizedColorStops.map((stop) => stop.color);

  return {
    backgroundGradient: undefined,
    backgroundGradientFrom: normalizedStops[0] ?? frame.backgroundGradientFrom,
    backgroundGradientTo: normalizedStops.at(-1) ?? frame.backgroundGradientTo,
    backgroundGradientStops: normalizedStops,
    backgroundGradientColorStops: normalizedColorStops,
  };
}

export function normalizeEditorFrameGradientColorStops(
  frame: FrameGradientSource
): EditorGradientColorStop[] {
  return normalizeEditorGradientStops(
    frame.backgroundGradientColorStops,
    normalizeEditorGradientColorList(
      frame.backgroundGradientStops,
      frame.backgroundGradientFrom,
      frame.backgroundGradientTo
    )
  );
}

export function createEditorFrameGradientCss(
  frame: FrameGradientSource & {
    backgroundGradientAngle: number;
    backgroundGradient?: LinearGradient | undefined;
  }
): string {
  if (frame.backgroundGradient) {
    return serializePaintToCss({ kind: 'gradient', gradient: frame.backgroundGradient });
  }
  return `linear-gradient(${frame.backgroundGradientAngle}deg, ${createEditorGradientCssStops(
    normalizeEditorFrameGradientColorStops(frame)
  )})`;
}

function normalizeEditorFrameGradientPatchStops(
  frame: FrameGradientSource,
  stops: readonly string[] | readonly EditorGradientColorStop[]
): EditorGradientColorStop[] {
  if (isEditorGradientColorStopList(stops)) {
    return normalizeEditorGradientStops(
      stops,
      createEditorGradientFallbackStops(frame.backgroundGradientFrom, frame.backgroundGradientTo)
    );
  }

  return normalizeEditorGradientColorList(
    stops,
    frame.backgroundGradientFrom,
    frame.backgroundGradientTo
  );
}

function isEditorGradientColorStopList(
  stops: readonly string[] | readonly EditorGradientColorStop[]
): stops is readonly EditorGradientColorStop[] {
  return stops.some((stop) => typeof stop !== 'string');
}

/** Parse the optional complete frame gradient at document and preset boundaries. */
export function parseEditorFrameGradient(value: unknown): LinearGradient | null | undefined {
  if (value === undefined) return undefined;
  const paint = parsePaint({ kind: 'gradient', gradient: value });
  return paint?.kind === 'gradient' && paint.gradient.type === 'linear' ? paint.gradient : null;
}

/** Resolve complete gradients while retaining the legacy visual interpretation. */
export function resolveEditorFrameGradient(
  frame: FrameGradientSource & {
    backgroundGradientAngle: number;
    backgroundGradient?: LinearGradient | undefined;
  }
): LinearGradient {
  if (frame.backgroundGradient) return structuredClone(frame.backgroundGradient);
  return {
    type: 'linear',
    angle: frame.backgroundGradientAngle,
    interpolation: 'srgb',
    repeat: { enabled: false, span: 1 },
    stops: normalizeEditorFrameGradientColorStops(frame).map((stop, index) => ({
      id: `editor-background-stop-${index}`,
      color: createEditorGradientColorStopColor(stop),
      position: stop.offset,
      midpoint: 0.5,
    })),
  };
}

/** Preserve the canonical gradient and maintain legacy read compatibility. */
export function createEditorFramePaintGradientPatch(gradient: LinearGradient) {
  return {
    ...createEditorFrameGradientPatch(
      { backgroundGradientFrom: '#00000000', backgroundGradientTo: '#00000000' },
      gradient.stops.map((stop) => ({ color: stop.color, offset: stop.position }))
    ),
    backgroundGradientAngle: gradient.angle,
    backgroundGradient: structuredClone(gradient),
    backgroundMode: 'gradient' as const,
  };
}
