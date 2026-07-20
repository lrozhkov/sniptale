export const SCENARIO_INSPECTOR_LIMITS = {
  animationDuration: { max: 60000, min: 0, scrub: true, step: 50 },
  borderWidth: { max: 64, min: 0, scrub: true, step: 1, unit: 'px' },
  buildIndex: { max: 999, min: 0, step: 1 },
  canvasHeight: { max: 4320, min: 240, scrub: true, step: 1, unit: 'px' },
  canvasWidth: { max: 7680, min: 320, scrub: true, step: 1, unit: 'px' },
  clickCount: { max: 999, min: 0, step: 1 },
  contentOffset: { max: 7680, min: -7680, scrub: true, step: 1, unit: 'px' },
  contentScale: { max: 10, min: 0.1, scrub: true, step: 0.05, unit: 'x' },
  coordinate: { max: 7680, min: -7680, scrub: true, step: 1, unit: 'px' },
  cornerRadius: { max: 240, min: 0, scrub: true, step: 1, unit: 'px' },
  elementHeight: { max: 4320, min: 1, scrub: true, step: 1, unit: 'px' },
  elementWidth: { max: 7680, min: 1, scrub: true, step: 1, unit: 'px' },
  fontSize: { max: 320, min: 8, scrub: true, step: 1, unit: 'px' },
  fontWeight: { max: 900, min: 100, scrub: true, step: 10 },
  gridColumns: { max: 24, min: 1, step: 1 },
  gridGutter: { max: 320, min: 0, scrub: true, step: 1, unit: 'px' },
  gridMargin: { max: 320, min: 0, scrub: true, step: 1, unit: 'px' },
  gridRows: { max: 24, min: 1, step: 1 },
  lineStrokeWidth: { max: 64, min: 1, scrub: true, step: 1, unit: 'px' },
  opacity: { displayScale: 100, max: 1, min: 0, scrub: true, step: 0.01, unit: '%' },
  strokeWidth: { max: 64, min: 0, scrub: true, step: 1, unit: 'px' },
  transitionDuration: { max: 60000, min: 0, scrub: true, step: 50 },
} as const;

type ScenarioNumberLimit = {
  max: number;
  min: number;
};

export function clampScenarioNumber(value: number, limit: ScenarioNumberLimit): number {
  if (!Number.isFinite(value)) {
    return limit.min;
  }

  return Math.min(Math.max(value, limit.min), limit.max);
}
