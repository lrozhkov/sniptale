import { formatHexColor, parseColor } from '@sniptale/foundation/color';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';

type SimplifyContent = 'text' | 'all';
type SimplifyManualKind = 'text' | 'image';
type SimplifySensitivity = 10 | 55 | 90;
type SimplifyThickness = 0.35 | 0.5 | 0.65;
type SimplifyLineSpacing = 1 | 1.5 | 2;

export interface SimplifySettings {
  readonly automatic: boolean;
  readonly content: SimplifyContent;
  readonly manualKind: SimplifyManualKind;
  readonly sensitivity: SimplifySensitivity;
  readonly thickness: SimplifyThickness;
  readonly lineSpacing: SimplifyLineSpacing;
  readonly color: string | null;
}

export const SIMPLIFY_SENSITIVITIES = [10, 55, 90] as const;
export const SIMPLIFY_THICKNESSES = [0.35, 0.5, 0.65] as const;
export const SIMPLIFY_LINE_SPACINGS = [1, 1.5, 2] as const;

/** Returns independent defaults for a new drawing session. */
export function createDefaultSimplifySettings(): SimplifySettings {
  return {
    automatic: true,
    content: 'text',
    manualKind: 'text',
    sensitivity: 55,
    thickness: 0.5,
    lineSpacing: 1.5,
    color: null,
  };
}

/** Admits persisted and transported settings without accepting executable fields. */
export function parseSimplifySettings(value: unknown): SimplifySettings | null {
  if (!isPlainRecord(value)) return null;
  const automatic = value['automatic'];
  const content = value['content'];
  const manualKind = value['manualKind'];
  const sensitivity = value['sensitivity'];
  const thickness = value['thickness'];
  const lineSpacing = value['lineSpacing'] === undefined ? 1.5 : value['lineSpacing'];
  const color = value['color'];
  if (
    typeof automatic !== 'boolean' ||
    (content !== 'text' && content !== 'all') ||
    (manualKind !== 'text' && manualKind !== 'image') ||
    (sensitivity !== 10 && sensitivity !== 55 && sensitivity !== 90) ||
    (thickness !== 0.35 && thickness !== 0.5 && thickness !== 0.65) ||
    (lineSpacing !== 1 && lineSpacing !== 1.5 && lineSpacing !== 2)
  )
    return null;
  if (color === null)
    return { automatic, content, manualKind, sensitivity, thickness, lineSpacing, color };
  if (typeof color !== 'string' || color.length > 128) return null;
  const parsed = parseColor(color);
  if (!parsed || parsed.alpha !== 1) return null;
  return {
    automatic,
    content,
    manualKind,
    sensitivity,
    thickness,
    lineSpacing,
    color: formatHexColor(parsed),
  };
}
