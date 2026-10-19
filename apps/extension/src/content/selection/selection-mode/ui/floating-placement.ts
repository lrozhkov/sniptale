export type SelectionFloatingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function overlapArea(surface: SelectionFloatingRect, exclusion: SelectionFloatingRect): number {
  const width = Math.max(
    0,
    Math.min(surface.x + surface.width, exclusion.x + exclusion.width) -
      Math.max(surface.x, exclusion.x)
  );
  const height = Math.max(
    0,
    Math.min(surface.y + surface.height, exclusion.y + exclusion.height) -
      Math.max(surface.y, exclusion.y)
  );
  return width * height;
}

function axisCandidates(
  start: number,
  length: number,
  surface: number,
  viewport: number,
  exclusions: readonly { start: number; length: number }[],
  gap: number,
  margin: number
): number[] {
  const maximum = Math.max(margin, viewport - surface - margin);
  const candidates = [
    start - surface - gap,
    start + length + gap,
    start,
    start + length - surface,
    margin,
    maximum,
    ...exclusions.flatMap((rect) => [rect.start - surface - gap, rect.start + rect.length + gap]),
  ];
  return [...new Set(candidates.map((value) => Math.min(maximum, Math.max(margin, value))))];
}

export function placeSelectionFloatingSurface(args: {
  anchor: SelectionFloatingRect;
  exclusion: SelectionFloatingRect;
  protectedRect?: SelectionFloatingRect;
  width: number;
  height: number;
  viewport: { width: number; height: number };
  gap?: number;
  margin?: number;
}): { x: number; y: number } {
  const gap = args.gap ?? 10;
  const margin = args.margin ?? 8;
  const exclusions = [args.exclusion, ...(args.protectedRect ? [args.protectedRect] : [])];
  const horizontal = axisCandidates(
    args.anchor.x,
    args.anchor.width,
    args.width,
    args.viewport.width,
    exclusions.map((rect) => ({ start: rect.x, length: rect.width })),
    gap,
    margin
  );
  const vertical = axisCandidates(
    args.anchor.y,
    args.anchor.height,
    args.height,
    args.viewport.height,
    exclusions.map((rect) => ({ start: rect.y, length: rect.height })),
    gap,
    margin
  );
  const candidates = horizontal.flatMap((x) =>
    vertical.map((y) => {
      const surface = { x, y, width: args.width, height: args.height };
      return {
        x,
        y,
        protectedOverlap: args.protectedRect ? overlapArea(surface, args.protectedRect) : 0,
        cropOverlap: overlapArea(surface, args.exclusion),
        distance: Math.hypot(x - args.anchor.x, y - args.anchor.y),
      };
    })
  );
  candidates.sort(
    (first, second) =>
      first.protectedOverlap - second.protectedOverlap ||
      first.cropOverlap - second.cropOverlap ||
      first.distance - second.distance
  );
  const best = candidates[0]!;
  return { x: best.x, y: best.y };
}
