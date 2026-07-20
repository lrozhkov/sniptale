import { expect, it } from 'vitest';

import type { FinalElementsOptions } from './types';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';

function createSelectionVisual(): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: {},
    fillColor: '#22c55e',
    fillOpacity: 20,
    id: 'preset-1',
    inheritCustomCss: false,
    opacity: 100,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 30,
    strokeColor: '#38bdf8',
    strokeOpacity: 100,
    strokeStyle: 'solid',
    strokeWidth: 2,
  };
}

it('exposes the final-elements options shape for owner-local composition', () => {
  const options: FinalElementsOptions = {
    zIndexBase: 600,
    overlayBackground: 'rgba(0, 0, 0, 0.4)',
    minSelectionSize: 120,
    getMaxSelectionWidth: () => 1280,
    getMaxSelectionHeight: () => 720,
    onConfirm: () => {},
    onResetToIdle: () => {},
    onSetupSizePanelListeners: () => {},
    visual: createSelectionVisual(),
  };

  expect(options.visual.strokeWidth).toBe(2);
  expect(options.getMaxSelectionWidth()).toBe(1280);
});
