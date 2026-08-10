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
    fillColor: '#22c55e40',
    fillCss: '#22c55e40',
    id: 'preset-1',
    inheritCustomCss: true,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 30,
    strokeColor: '#2563ebbf',
    strokeStyle: 'dashed',
    strokeWidth: 3,
    ...overrides,
  };
}

describe('selection-mode ui style helpers', () => {
  it('renders drag-frame css without a viewport-sized spread shadow', () => {
    const cssText = getSelectionDragFrameStyle(createSelectionVisual());

    expect(cssText).toContain('border: 3px dashed #2563ebbf');
    expect(cssText).toContain('background: #22c55e40');
    expect(cssText).not.toContain('9999px');
    expect(cssText).toContain('outline-offset: 2px;');
  });

  it('renders hover and final-frame css across soft, hard, and no-shadow variants', () => {
    expect(getSelectionHoverFrameStyle(createSelectionVisual())).toContain(
      'color-mix(in srgb, #2563ebbf 32%, transparent)'
    );
    expect(getSelectionFinalFrameStyle(createSelectionVisual({ shadow: 100 }), 500)).toContain(
      'color-mix(in srgb, #2563ebbf 52%, transparent)'
    );
    expect(getSelectionFinalFrameStyle(createSelectionVisual({ shadow: 0 }), 500)).not.toContain(
      'box-shadow'
    );
  });

  it('uses border-box sizing so visual frames do not add pixels to the right or bottom edges', () => {
    expect(getSelectionDragFrameStyle(createSelectionVisual())).toContain('box-sizing: border-box');
    expect(getSelectionHoverFrameStyle(createSelectionVisual())).toContain(
      'box-sizing: border-box'
    );
    expect(getSelectionFinalFrameStyle(createSelectionVisual(), 500)).toContain(
      'box-sizing: border-box'
    );
  });

  it('places safe custom decoration above paint defaults and below protected stroke fields', () => {
    const cssText = getSelectionDragFrameStyle(
      createSelectionVisual({
        customCssStyles: {
          backgroundImage: 'linear-gradient(red, blue)',
          boxShadow: '0 0 4px red',
        },
      })
    );

    expect(cssText).toContain('background-image: linear-gradient(red, blue);');
    expect(cssText).toContain('box-shadow: 0 0 4px red;');
    expect(cssText.lastIndexOf('box-shadow: 0 0 4px red;')).toBeGreaterThan(
      cssText.indexOf('box-shadow: color-mix')
    );
    expect(cssText.indexOf('border: 3px dashed')).toBeGreaterThan(
      cssText.indexOf('background-image: linear-gradient(red, blue);')
    );
  });
});
