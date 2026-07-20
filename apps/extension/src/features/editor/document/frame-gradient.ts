import type { EditorFrameSettings } from './types';
import {
  createEditorGradientCssStops,
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
> {
  const normalizedColorStops = normalizeEditorFrameGradientPatchStops(frame, stops);
  const normalizedStops = normalizedColorStops.map((stop) => stop.color);

  return {
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
  }
): string {
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
