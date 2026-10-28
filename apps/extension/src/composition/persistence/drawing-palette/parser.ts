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
  return {
    schemaVersion: 1,
    colors: [...state.colors],
    ...(state.names ? { names: { ...state.names } } : {}),
  };
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
  const parsedNames = parsePaletteColorNames(record['names']);
  if (parsedNames === null)
    return {
      state: { schemaVersion: 1, colors: colors.map(normalizeOpaqueColor) },
      unsafeForWrite: true,
    };
  return {
    state: {
      schemaVersion: 1,
      colors: colors.map(normalizeOpaqueColor),
      ...(parsedNames ? { names: parsedNames } : {}),
    },
    unsafeForWrite: false,
  };
}

function parsePaletteColorNames(value: unknown): Record<string, string> | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries: [string, unknown][] = Object.entries(value);
  if (entries.length > 512) return null;
  const names: Record<string, string> = {};
  for (const [hex, name] of entries) {
    if (
      !OPAQUE_HEX_COLOR.test(hex) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 80 ||
      [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      return null;
    names[hex.toLowerCase()] = name.trim();
  }
  return entries.length ? names : undefined;
}
