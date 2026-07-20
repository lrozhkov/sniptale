// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';
import { assembleSelectionModeFinalElements } from './assemble';

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

describe('selection-mode final elements assembly', () => {
  it('assembles the overlay, frame, tooltip, and resize handles in one owner seam', () => {
    const overlayContainer = document.createElement('div');
    const elements = assembleSelectionModeFinalElements(overlayContainer, {
      zIndexBase: 600,
      overlayBackground: 'rgba(0, 0, 0, 0.4)',
      minSelectionSize: 100,
      getMaxSelectionWidth: () => 1280,
      getMaxSelectionHeight: () => 720,
      onConfirm: () => {},
      onResetToIdle: () => {},
      onSetupSizePanelListeners: () => {},
      visual: createSelectionVisual(),
    });

    expect(elements.finalOverlay.className).toBe('sniptale-selection-final-overlay');
    expect(elements.finalFrame.className).toBe('sniptale-selection-final-frame');
    expect(elements.finalFrame.querySelectorAll('.sniptale-resize-handle')).toHaveLength(8);
    expect(overlayContainer.querySelector('.sniptale-selection-final-overlay')).toBe(
      elements.finalOverlay
    );
    expect(overlayContainer.querySelector('.sniptale-selection-final-frame')).toBe(
      elements.finalFrame
    );
  });
});
