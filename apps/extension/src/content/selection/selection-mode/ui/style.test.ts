// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import {
  getSelectionDragFrameStyle,
  getSelectionFinalFrameStyle,
  getSelectionHoverFrameStyle,
} from './style';

function createSelectionVisual(
  overrides: Partial<ResolvedBorderPresetVisual> = {}
): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: { outlineOffset: '2px' },
    fillColor: '#22c55e',
    fillOpacity: 25,
    id: 'preset-1',
    inheritCustomCss: true,
    opacity: 100,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 30,
    strokeColor: '#2563eb',
    strokeOpacity: 75,
    strokeStyle: 'dashed',
    strokeWidth: 3,
    ...overrides,
  };
}

describe('selection-mode ui style helpers', () => {
  it('renders drag-frame css with overlay shade and portable preset visuals', () => {
    const cssText = getSelectionDragFrameStyle(createSelectionVisual(), 'rgba(0, 0, 0, 0.4)');

    expect(cssText).toContain('border: 3px dashed rgba(37, 99, 235, 0.75)');
    expect(cssText).toContain('background-color: rgba(34, 197, 94, 0.25)');
    expect(cssText).toContain('box-shadow:');
    expect(cssText).toContain('outline-offset: 2px;');
  });

  it('renders hover and final-frame css across soft, hard, and no-shadow variants', () => {
    expect(getSelectionHoverFrameStyle(createSelectionVisual())).toContain(
      'color-mix(in srgb, #2563eb 32%, transparent)'
    );
    expect(getSelectionFinalFrameStyle(createSelectionVisual({ shadow: 100 }), 500)).toContain(
      'color-mix(in srgb, #2563eb 52%, transparent)'
    );
    expect(getSelectionFinalFrameStyle(createSelectionVisual({ shadow: 0 }), 500)).not.toContain(
      'box-shadow'
    );
  });

  it('uses border-box sizing so visual frames do not add pixels to the right or bottom edges', () => {
    expect(getSelectionDragFrameStyle(createSelectionVisual(), 'rgba(0, 0, 0, 0.4)')).toContain(
      'box-sizing: border-box'
    );
    expect(getSelectionHoverFrameStyle(createSelectionVisual())).toContain(
      'box-sizing: border-box'
    );
    expect(getSelectionFinalFrameStyle(createSelectionVisual(), 500)).toContain(
      'box-sizing: border-box'
    );
  });
});
