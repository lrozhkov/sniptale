import { expect, it, vi } from 'vitest';
import { EDITOR_RASTER_FILL_MODE, EDITOR_RASTER_SELECTION_MODE } from '../../state/raster-tools';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import {
  coerceRasterNumber,
  createRasterBucketFillPatch,
  getRasterFillModeLabel,
  getRasterSelectionModeLabel,
  getRasterSelectionTargetLabel,
  rasterFillModeOptions,
  rasterSelectionModeOptions,
} from './options';

it('shares raster option labels between full and compact inspector controls', () => {
  expect(rasterSelectionModeOptions).toHaveLength(3);
  expect(rasterFillModeOptions).toHaveLength(2);
  expect(getRasterSelectionModeLabel(EDITOR_RASTER_SELECTION_MODE.WAND)).toBe(
    'editor.sidebar.rasterSelectionWand'
  );
  expect(getRasterFillModeLabel(EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT)).toBe(
    'editor.sidebar.rasterFillLinearGradient'
  );
});

it('resolves the raster selection target fallback label', () => {
  expect(getRasterSelectionTargetLabel({ targetLayerName: 'Layer 1' })).toBe('Layer 1');
  expect(getRasterSelectionTargetLabel({ targetLayerName: null })).toBe(
    'editor.sidebar.rasterSelectionActive'
  );
});

it('normalizes raster numeric input and bucket fill patches', () => {
  expect(coerceRasterNumber('42', 8)).toBe(42);
  expect(coerceRasterNumber('', 8)).toBe(8);
  expect(
    createRasterBucketFillPatch(
      {
        fillColor: '#111111',
        gradientFrom: '#111111',
      },
      '#222222'
    )
  ).toEqual({ fillColor: '#222222', gradientFrom: '#222222' });
  expect(
    createRasterBucketFillPatch(
      {
        fillColor: '#111111',
        gradientFrom: '#333333',
      },
      '#222222'
    )
  ).toEqual({ fillColor: '#222222', gradientFrom: '#333333' });
});
