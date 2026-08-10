import { DEFAULT_DRAWING_COLORS } from '../../../features/drawing/public';
import { DRAWING_PALETTE_SCHEMA_VERSION, type DrawingPaletteStateV1 } from './contracts';

const OPAQUE_HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normalizeOpaqueColor(color: unknown): string {
  return typeof color === 'string' ? color.toLowerCase() : '';
}

export function createDefaultDrawingPaletteState(): DrawingPaletteStateV1 {
  return { schemaVersion: DRAWING_PALETTE_SCHEMA_VERSION, colors: [...DEFAULT_DRAWING_COLORS] };
}

export function cloneDrawingPaletteState(state: DrawingPaletteStateV1): DrawingPaletteStateV1 {
  return { schemaVersion: 1, colors: [...state.colors] };
}

export function parseDrawingPaletteState(value: unknown): {
  state: DrawingPaletteStateV1;
  unsafeForWrite: boolean;
} {
  if (value === undefined)
    return { state: createDefaultDrawingPaletteState(), unsafeForWrite: false };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { state: createDefaultDrawingPaletteState(), unsafeForWrite: true };
  }
  const record = value as Record<string, unknown>;
  if (
    record['schemaVersion'] !== DRAWING_PALETTE_SCHEMA_VERSION ||
    !Array.isArray(record['colors'])
  ) {
    return { state: createDefaultDrawingPaletteState(), unsafeForWrite: true };
  }
  const colors = record['colors'];
  if (
    colors.length !== 10 ||
    colors.some((color) => typeof color !== 'string' || !OPAQUE_HEX_COLOR.test(color))
  ) {
    return { state: createDefaultDrawingPaletteState(), unsafeForWrite: true };
  }
  return {
    state: { schemaVersion: 1, colors: colors.map(normalizeOpaqueColor) },
    unsafeForWrite: false,
  };
}
