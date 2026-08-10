import { arePaintsEqual, clonePaint, parsePaint } from '@sniptale/foundation/paint';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { canonicalizeSurfaceCss } from './surface-css';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseSurfaceStyle(value: unknown): SurfaceStyle | null {
  if (!isRecord(value)) return null;
  const fillPaint = parsePaint(value['fillPaint']);
  const surfaceCss =
    typeof value['surfaceCss'] === 'string' ? canonicalizeSurfaceCss(value['surfaceCss']) : null;
  return fillPaint && surfaceCss !== null ? { fillPaint, surfaceCss } : null;
}

export function cloneSurfaceStyle(style: SurfaceStyle): SurfaceStyle {
  const surfaceCss = canonicalizeSurfaceCss(style.surfaceCss);
  if (surfaceCss === null) throw new TypeError('Cannot clone an invalid SurfaceStyle');
  return { fillPaint: clonePaint(style.fillPaint), surfaceCss };
}

export function areSurfaceStylesEqual(left: SurfaceStyle, right: SurfaceStyle): boolean {
  const leftCss = canonicalizeSurfaceCss(left.surfaceCss);
  const rightCss = canonicalizeSurfaceCss(right.surfaceCss);
  return (
    leftCss !== null &&
    rightCss !== null &&
    leftCss === rightCss &&
    arePaintsEqual(left.fillPaint, right.fillPaint)
  );
}
