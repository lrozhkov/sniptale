import type { EditorGradientColorStop } from '../../features/editor/document/gradient';

export const EDITOR_RASTER_SELECTION_MODE = {
  LASSO: 'lasso',
  MARQUEE: 'marquee',
  WAND: 'wand',
} as const;

type EditorRasterSelectionMode =
  (typeof EDITOR_RASTER_SELECTION_MODE)[keyof typeof EDITOR_RASTER_SELECTION_MODE];

export const EDITOR_RASTER_FILL_MODE = {
  BUCKET: 'bucket',
  LINEAR_GRADIENT: 'linear-gradient',
} as const;

type EditorRasterFillMode = (typeof EDITOR_RASTER_FILL_MODE)[keyof typeof EDITOR_RASTER_FILL_MODE];

export interface EditorRasterToolSettings {
  brushColor: string;
  brushHardness: number;
  brushOpacity: number;
  brushSize: number;
  selectionMode: EditorRasterSelectionMode;
  eraserSize: number;
  fillMode: EditorRasterFillMode;
  fillColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientStops?: EditorGradientColorStop[] | undefined;
}

export interface EditorRasterSelectionSummary {
  hasSelection: boolean;
  targetLayerId: string | null;
  targetLayerName: string | null;
}

export const EDITOR_RASTER_TARGET_STATUS = {
  LOCKED: 'locked',
  MISSING: 'missing',
  MULTIPLE: 'multiple',
  READY: 'ready',
  UNSUPPORTED: 'unsupported',
  WILL_RASTERIZE: 'will-rasterize',
} as const;

type EditorRasterTargetStatus =
  (typeof EDITOR_RASTER_TARGET_STATUS)[keyof typeof EDITOR_RASTER_TARGET_STATUS];

export interface EditorRasterTargetSummary {
  status: EditorRasterTargetStatus;
  layerId: string | null;
  layerName: string | null;
}

export const DEFAULT_EDITOR_RASTER_TOOL_SETTINGS: EditorRasterToolSettings = {
  brushColor: '#ea580c',
  brushHardness: 0.85,
  brushOpacity: 1,
  brushSize: 24,
  selectionMode: EDITOR_RASTER_SELECTION_MODE.MARQUEE,
  eraserSize: 28,
  fillMode: EDITOR_RASTER_FILL_MODE.BUCKET,
  fillColor: '#111827',
  gradientFrom: '#111827',
  gradientTo: '#ffffff',
  gradientStops: [
    { color: '#111827', offset: 0 },
    { color: '#ffffff', offset: 1 },
  ],
};

export const EMPTY_EDITOR_RASTER_SELECTION_SUMMARY: EditorRasterSelectionSummary = {
  hasSelection: false,
  targetLayerId: null,
  targetLayerName: null,
};

export const EMPTY_EDITOR_RASTER_TARGET_SUMMARY: EditorRasterTargetSummary = {
  status: EDITOR_RASTER_TARGET_STATUS.MISSING,
  layerId: null,
  layerName: null,
};

export function isEditorRasterTargetActionableStatus(
  status: EditorRasterTargetStatus
): status is Extract<
  EditorRasterTargetStatus,
  typeof EDITOR_RASTER_TARGET_STATUS.READY | typeof EDITOR_RASTER_TARGET_STATUS.WILL_RASTERIZE
> {
  return (
    status === EDITOR_RASTER_TARGET_STATUS.READY ||
    status === EDITOR_RASTER_TARGET_STATUS.WILL_RASTERIZE
  );
}
