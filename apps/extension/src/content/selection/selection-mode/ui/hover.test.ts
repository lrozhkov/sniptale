// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import { createHoverElements, hideHoverFrame, showHoverFrame } from './hover';
import type { SelectionModeDom } from './dom-types';

function createSelectionModeDomFixture(): SelectionModeDom {
  const overlayContainer = document.createElement('div');
  document.body.appendChild(overlayContainer);

  return {
    overlayContainer,
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: null,
    finalFrame: null,
    finalOverlay: null,
    sizePanel: null,
    sizeTooltip: null,
    widthInput: null,
    heightInput: null,
    aspectRatioButton: null,
    cancelButton: null,
    dragEventCatcher: null,
  };
}

function createSelectionVisual(
  overrides: Partial<ResolvedBorderPresetVisual> = {}
): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: { outlineOffset: '2px' },
    fillColor: '#c084fc',
    fillOpacity: 30,
    id: 'preset-1',
    inheritCustomCss: true,
    opacity: 100,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 6,
    shadow: 30,
    strokeColor: '#c084fc',
    strokeOpacity: 80,
    strokeStyle: 'dashed',
    strokeWidth: 3,
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('selection-mode hover frame', () => {
  it('positions the hover frame on the exact element bounds', () => {
    const dom = createSelectionModeDomFixture();
    createHoverElements(dom, createSelectionVisual(), 100);

    showHoverFrame(dom, { x: 120, y: 48, width: 280, height: 140 });

    expect(dom.hoverFrame?.style.left).toBe('120px');
    expect(dom.hoverFrame?.style.top).toBe('48px');
    expect(dom.hoverFrame?.style.width).toBe('280px');
    expect(dom.hoverFrame?.style.height).toBe('140px');
    expect(dom.hoverFrame?.style.border).toContain('3px dashed');
    expect(dom.hoverFrame?.style.backgroundColor).toBe('rgba(192, 132, 252, 0.3)');
    expect(dom.hoverFrame?.style.borderRadius).toBe('6px');
    expect(dom.hoverFrame?.style.display).toBe('block');
    expect(dom.hoverSizeLabel?.textContent).toBe('280 × 140');
    expect(dom.hoverSizeLabel?.style.left).toBe('120px');
    expect(dom.hoverSizeLabel?.style.top).toBe('194px');
  });

  it('hides both hover elements when requested', () => {
    const dom = createSelectionModeDomFixture();
    createHoverElements(dom, createSelectionVisual({ strokeColor: '#fff', strokeWidth: 2 }), 100);

    showHoverFrame(dom, { x: 10, y: 20, width: 30, height: 40 });
    hideHoverFrame(dom);

    expect(dom.hoverFrame?.style.display).toBe('none');
    expect(dom.hoverSizeLabel?.style.display).toBe('none');
  });
});
