import { getComposedParent } from './composed-parent';
import { parseColor, type RgbaColor } from '@sniptale/foundation/color';

type ReadStyle = (element: Element) => CSSStyleDeclaration | null;
type CheckContrast =
  | { kind: 'measured'; ratio: number; required: number; foreground: string; background: string }
  | { kind: 'unknown' | 'inapplicable' };

function luminance(color: RgbaColor): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}
export function checkContrastRatio(foreground: RgbaColor, background: RgbaColor): number {
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function complexPaint(styles: CSSStyleDeclaration): boolean {
  return (
    Number(styles.opacity || '1') !== 1 ||
    [
      styles.filter,
      styles.getPropertyValue('backdrop-filter'),
      styles.getPropertyValue('mask-image'),
    ].some((value) => Boolean(value && value !== 'none')) ||
    Boolean(styles.mixBlendMode && styles.mixBlendMode !== 'normal')
  );
}

/** Calculates CSS contrast only when an opaque solid backing and its composition are known. */
export function readCheckContrast(
  element: Element,
  readStyle: ReadStyle,
  hasPseudoContent: (element: Element) => boolean = () => false
): CheckContrast {
  const styles = readStyle(element);
  if (!styles) return { kind: 'unknown' };
  const foreground = parseColor(styles.color);
  if (foreground?.alpha === 0) return { kind: 'inapplicable' };
  if (
    !foreground ||
    foreground.alpha !== 1 ||
    (styles.textShadow && styles.textShadow !== 'none') ||
    Number.parseFloat(styles.getPropertyValue('-webkit-text-stroke-width') || '0') !== 0
  )
    return { kind: 'unknown' };
  let current: Element | null = element,
    background: RgbaColor | null = null,
    backgroundValue = '';
  for (let depth = 0; current; depth += 1) {
    if (depth >= 32) return { kind: 'unknown' };
    const style = readStyle(current);
    if (!style || complexPaint(style) || hasPseudoContent(current)) return { kind: 'unknown' };
    if (!background) {
      if (style.backgroundImage && style.backgroundImage !== 'none') return { kind: 'unknown' };
      const color = parseColor(style.backgroundColor);
      if (!color) return { kind: 'unknown' };
      if (color.alpha === 1) {
        background = color;
        backgroundValue = style.backgroundColor;
      } else if (color.alpha !== 0) return { kind: 'unknown' };
    }
    current = getComposedParent(current);
  }
  if (!background) return { kind: 'unknown' };
  const size = Number.parseFloat(styles.fontSize),
    weight = Number.parseFloat(styles.fontWeight);
  if (!Number.isFinite(size)) return { kind: 'unknown' };
  const required = size >= 24 || (size >= (14 * 4) / 3 && weight >= 700) ? 3 : 4.5;
  return {
    kind: 'measured',
    ratio: checkContrastRatio(foreground, background),
    required,
    foreground: styles.color,
    background: backgroundValue,
  };
}
