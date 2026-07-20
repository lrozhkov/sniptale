// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSelectionModeFinalOverlay } from './overlay';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';

beforeEach(() => {
  document.body.replaceChildren();
});

function createOptions() {
  return {
    zIndexBase: 400,
    overlayBackground: 'rgba(0, 0, 0, 0.55)',
    minSelectionSize: 100,
    getMaxSelectionWidth: () => 1280,
    getMaxSelectionHeight: () => 720,
    onConfirm: vi.fn(),
    onResetToIdle: vi.fn(),
    onSetupSizePanelListeners: vi.fn(),
    visual: createSelectionVisual(),
  };
}

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
    strokeColor: '#0ea5e9',
    strokeOpacity: 100,
    strokeStyle: 'solid',
    strokeWidth: 2,
  };
}

describe('selection-mode final overlay', () => {
  it('creates shades and a reset catcher', () => {
    const options = createOptions();
    const overlay = createSelectionModeFinalOverlay(options);

    expect(overlay.className).toBe('sniptale-selection-final-overlay');
    expect(overlay.querySelectorAll('.sniptale-shade')).toHaveLength(4);
    expect(overlay.querySelector('.sniptale-shade-top')).not.toBeNull();
    expect(overlay.querySelector('.sniptale-shade-bottom')).not.toBeNull();
    expect(overlay.querySelector('.sniptale-shade-left')).not.toBeNull();
    expect(overlay.querySelector('.sniptale-shade-right')).not.toBeNull();

    overlay
      .querySelector<HTMLElement>('.sniptale-selection-event-catcher')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(options.onResetToIdle).toHaveBeenCalledTimes(1);
  });
});
