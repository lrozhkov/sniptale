import type { CSSProperties } from 'react';
import type { Paint } from '@sniptale/foundation/paint';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { resolveCalloutColorBindings } from '../callout-color-bindings';
import { extractCalloutCardCss } from './card-section';
import { projectCanonicalSurfaceCss } from './surface-css';

export type ProjectedSurfaceShadow = {
  blur: number;
  color: string;
  inset: boolean;
  offsetX: number;
  offsetY: number;
  spread: number;
};

export type CalloutSurfaceProjection = {
  backdropStyle: CSSProperties;
  contentStyle: CSSProperties;
  effectStyle: CSSProperties;
  fillPaint: Paint;
  paintStyle: CSSProperties;
  shadows: ProjectedSurfaceShadow[];
  customBoxShadow?: string | undefined;
  customOutline?: {
    color?: string | undefined;
    offset?: string | undefined;
    style?: CSSProperties['outlineStyle'];
    width?: string | undefined;
  };
  outline: {
    color?: string | undefined;
    offset: number;
    style?: CSSProperties['outlineStyle'];
    width: number;
  };
  surface: {
    borderColor: string;
    borderStyle: CalloutVisualStyle['surface']['borderStyle'];
    borderWidth: number;
    radius: number;
  };
};

function splitTopLevel(value: string, delimiter: ',' | ' '): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const character of value.trim()) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    const separates = delimiter === ' ' ? /\s/u.test(character) : character === delimiter;
    if (separates && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseLength(value: string): number | null {
  if (value === '0' || value === '-0') return 0;
  if (!value.endsWith('px')) return null;
  const numericText = value.slice(0, -2);
  const unsigned = numericText.startsWith('-') ? numericText.slice(1) : numericText;
  const [integer, fraction, extra] = unsigned.split('.');
  const digitsOnly = (part: string) =>
    [...part].every((character) => character >= '0' && character <= '9');
  if (
    extra !== undefined ||
    (!integer && !fraction) ||
    !digitsOnly(integer ?? '') ||
    (fraction !== undefined && (!fraction || !digitsOnly(fraction)))
  ) {
    return null;
  }
  const numeric = Number(numericText);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseShadow(value: string): ProjectedSurfaceShadow | null {
  const tokens = splitTopLevel(value, ' ');
  const lengths: number[] = [];
  const color: string[] = [];
  let inset = false;
  for (const token of tokens) {
    if (token === 'inset') {
      if (inset) return null;
      inset = true;
      continue;
    }
    const length = parseLength(token);
    if (length !== null) {
      lengths.push(length);
      continue;
    }
    color.push(token);
  }
  if (lengths.length < 2 || lengths.length > 4 || color.length > 1) return null;
  if ((lengths[2] ?? 0) < 0) return null;
  return {
    blur: lengths[2] ?? 0,
    color: color[0] ?? 'currentColor',
    inset,
    offsetX: lengths[0]!,
    offsetY: lengths[1]!,
    spread: lengths[3] ?? 0,
  };
}

function parseBoxShadow(value: string): ProjectedSurfaceShadow[] | null {
  if (value.trim() === 'none') return [];
  const shadows = splitTopLevel(value, ',').map(parseShadow);
  return shadows.every((shadow) => shadow !== null) ? (shadows as ProjectedSurfaceShadow[]) : null;
}

export function parseResolvedCalloutBoxShadow(value: string): ProjectedSurfaceShadow[] | null {
  return parseBoxShadow(value);
}

function parsePixels(value: unknown): number | null {
  return typeof value === 'string' ? parseLength(value) : null;
}

function projectCustomStyles(custom: Record<string, string>) {
  const paintStyle: CSSProperties = {};
  const backdropStyle: CSSProperties = {};
  const contentStyle: CSSProperties = {};
  const effectStyle: CSSProperties = {};
  for (const key of [
    'background',
    'backgroundColor',
    'backgroundImage',
    'backgroundPosition',
    'backgroundRepeat',
    'backgroundSize',
  ] as const) {
    if (custom[key] !== undefined) paintStyle[key] = custom[key];
  }
  if (custom['backdropFilter'] !== undefined) {
    backdropStyle.backdropFilter = custom['backdropFilter'];
  }
  if (custom['color'] !== undefined) contentStyle.color = custom['color'];
  if (custom['textShadow'] !== undefined) contentStyle.textShadow = custom['textShadow'];
  if (custom['filter'] !== undefined) effectStyle.filter = custom['filter'];
  if (custom['opacity'] !== undefined) effectStyle.opacity = custom['opacity'];
  return { backdropStyle, contentStyle, effectStyle, paintStyle };
}

export function resolveCalloutSurfaceProjection(
  style: CalloutVisualStyle,
  frameColors?: {
    fillPaint?: CalloutVisualStyle['surface']['fillPaint'];
    borderColor?: string;
  }
): CalloutSurfaceProjection {
  const resolved = resolveCalloutColorBindings(style, frameColors ?? {});
  const cardCss = extractCalloutCardCss(style.customCss);
  const custom = cardCss === null ? null : projectCanonicalSurfaceCss(cardCss);
  const customStyles = projectCustomStyles(custom ?? {});
  const customBoxShadow = custom?.['boxShadow'];
  const nativeShadows: ProjectedSurfaceShadow[] =
    resolved.surface.shadow > 0
      ? [
          {
            blur: resolved.surface.shadow,
            color: resolved.surface.shadowColor,
            inset: false,
            offsetX: 0,
            offsetY: Math.max(1, resolved.surface.shadow / 3),
            spread: 0,
          },
        ]
      : [];
  const customOutline = {
    ...(custom?.['outlineColor'] === undefined ? {} : { color: custom['outlineColor'] }),
    ...(custom?.['outlineOffset'] === undefined ? {} : { offset: custom['outlineOffset'] }),
    ...(custom?.['outlineStyle'] === undefined
      ? {}
      : { style: custom['outlineStyle'] as CSSProperties['outlineStyle'] }),
    ...(custom?.['outlineWidth'] === undefined ? {} : { width: custom['outlineWidth'] }),
  };
  return {
    ...customStyles,
    contentStyle: { color: resolved.surface.textColor, ...customStyles.contentStyle },
    ...(customBoxShadow === undefined ? {} : { customBoxShadow }),
    ...(Object.keys(customOutline).length === 0 ? {} : { customOutline }),
    fillPaint: resolved.surface.fillPaint,
    shadows: customBoxShadow === undefined ? nativeShadows : [],
    outline: {
      color: custom?.['outlineColor'],
      offset: parsePixels(custom?.['outlineOffset']) ?? 0,
      style: custom?.['outlineStyle'] as CSSProperties['outlineStyle'],
      width: parsePixels(custom?.['outlineWidth']) ?? 0,
    },
    surface: {
      borderColor: resolved.surface.borderColor,
      borderStyle: resolved.surface.borderStyle,
      borderWidth: resolved.surface.borderWidth,
      radius: resolved.surface.radius,
    },
  };
}
