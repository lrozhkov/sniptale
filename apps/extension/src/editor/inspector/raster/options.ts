import { translate } from '../../../platform/i18n';
import { EDITOR_RASTER_FILL_MODE, EDITOR_RASTER_SELECTION_MODE } from '../../state/raster-tools';

type RasterFillMode = (typeof EDITOR_RASTER_FILL_MODE)[keyof typeof EDITOR_RASTER_FILL_MODE];
type RasterSelectionMode =
  (typeof EDITOR_RASTER_SELECTION_MODE)[keyof typeof EDITOR_RASTER_SELECTION_MODE];

export const rasterSelectionModeOptions = [
  {
    label: translate('editor.sidebar.rasterSelectionMarquee'),
    value: EDITOR_RASTER_SELECTION_MODE.MARQUEE,
  },
  {
    label: translate('editor.sidebar.rasterSelectionWand'),
    value: EDITOR_RASTER_SELECTION_MODE.WAND,
  },
  {
    label: translate('editor.sidebar.rasterSelectionLasso'),
    value: EDITOR_RASTER_SELECTION_MODE.LASSO,
  },
] as const;

export const rasterFillModeOptions = [
  { label: translate('editor.sidebar.rasterFillBucket'), value: EDITOR_RASTER_FILL_MODE.BUCKET },
  {
    label: translate('editor.sidebar.rasterFillLinearGradient'),
    value: EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT,
  },
] as const;

export function getRasterSelectionModeLabel(value: RasterSelectionMode): string {
  return rasterSelectionModeOptions.find((option) => option.value === value)?.label ?? value;
}

export function getRasterFillModeLabel(value: RasterFillMode): string {
  return rasterFillModeOptions.find((option) => option.value === value)?.label ?? value;
}

export function getRasterSelectionTargetLabel(selection: {
  targetLayerName?: string | null;
}): string {
  return selection.targetLayerName ?? translate('editor.sidebar.rasterSelectionActive');
}

export function coerceRasterNumber(value: string, fallback: number): number {
  return Number(value) || fallback;
}

export function createRasterBucketFillPatch(
  settings: {
    fillColor: string;
    gradientFrom: string;
  },
  fillColor: string
) {
  return {
    fillColor,
    gradientFrom: settings.gradientFrom === settings.fillColor ? fillColor : settings.gradientFrom,
  };
}
