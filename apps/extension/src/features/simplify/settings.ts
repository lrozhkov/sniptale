import { formatHexColor, parseColor } from '@sniptale/foundation/color';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';

type SimplifyContent = 'text' | 'all';
type SimplifyManualKind = 'text' | 'image';
type SimplifySensitivity = 10 | 55 | 90;
type SimplifyThickness = 0.35 | 0.5 | 0.65;

export interface SimplifySettings {
  readonly automatic: boolean;
  readonly content: SimplifyContent;
  readonly manualKind: SimplifyManualKind;
  readonly sensitivity: SimplifySensitivity;
  readonly thickness: SimplifyThickness;
  readonly color: string | null;
}

export const SIMPLIFY_SENSITIVITIES = [10, 55, 90] as const;
export const SIMPLIFY_THICKNESSES = [0.35, 0.5, 0.65] as const;

/** Returns independent defaults for a new drawing session. */
export function createDefaultSimplifySettings(): SimplifySettings {
  return {
    automatic: true,
    content: 'text',
    manualKind: 'text',
    sensitivity: 55,
    thickness: 0.5,
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
  const color = value['color'];
  if (
    typeof automatic !== 'boolean' ||
    (content !== 'text' && content !== 'all') ||
    (manualKind !== 'text' && manualKind !== 'image') ||
    (sensitivity !== 10 && sensitivity !== 55 && sensitivity !== 90) ||
    (thickness !== 0.35 && thickness !== 0.5 && thickness !== 0.65)
  )
    return null;
  if (color === null) return { automatic, content, manualKind, sensitivity, thickness, color };
  if (typeof color !== 'string' || color.length > 128) return null;
  const parsed = parseColor(color);
  if (!parsed || parsed.alpha !== 1) return null;
  return { automatic, content, manualKind, sensitivity, thickness, color: formatHexColor(parsed) };
}
