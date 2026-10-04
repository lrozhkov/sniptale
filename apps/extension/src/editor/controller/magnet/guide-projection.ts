type GuidePoint = { x: number; y: number };
type GuideLine = { origin: GuidePoint; target: GuidePoint };

export type MagnetGuideProjection = { lines: GuideLine[]; points: GuidePoint[] };

export function projectMagnetGuides(
  verticalLines: Set<string>,
  horizontalLines: Set<string>,
  onlyDrawPoint: boolean
): MagnetGuideProjection {
  const vertical = [...verticalLines]
    .map(parseGuide)
    .filter((entry): entry is GuideLine => entry !== null);
  const horizontal = [...horizontalLines]
    .map(parseGuide)
    .filter((entry): entry is GuideLine => entry !== null);
  return onlyDrawPoint
    ? { lines: [], points: [...vertical, ...horizontal].map((entry) => entry.target) }
    : {
        lines: [
          ...vertical.map((entry) => ({
            origin: { x: entry.target.x, y: entry.origin.y },
            target: entry.target,
          })),
          ...horizontal.map((entry) => ({
            origin: { x: entry.origin.x, y: entry.target.y },
            target: entry.target,
          })),
        ],
        points: [],
      };
}

function parseGuide(value: string): GuideLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !('origin' in parsed) || !('target' in parsed))
    return null;
  const { origin, target } = parsed;
  if (!isGuidePoint(origin) || !isGuidePoint(target)) return null;
  return { origin, target };
}

function isGuidePoint(value: unknown): value is GuidePoint {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'x' in value &&
    'y' in value &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}
