export const DRAWING_PALETTE_STORAGE_KEY = 'sniptale_drawing_palette';
export const DRAWING_PALETTE_SCHEMA_VERSION = 1;

export interface DrawingPaletteStateV1 {
  readonly schemaVersion: 1;
  readonly colors: readonly string[];
}
