// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { BorderPreset } from '../../../../features/highlighter/contracts';
import {
  applyFrameOffsetToElement,
  calculateFrameOffsetFromElement,
  calculateFrameViewportCoords,
} from './coords';

function createDomRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    ...rect,
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    toJSON: () => rect,
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
  } as DOMRect;
}

function createIframeElementWithTarget() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;

  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected jsdom iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  const target = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(target);

  return { iframe, target };
}

const testBorderSettings: BorderPreset = {
  color: '#ff671d',
  customCss: '',
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  strokeOpacity: 100,
  id: 'preset-1',
  isSystemDefault: true,
  name: 'Preset',
  opacity: 100,
  order: 0,
  padding: {
    top: 2,
    right: 5,
    bottom: 7,
    left: 3,
  },
  radius: 0,
  shadow: 0,
  style: 'solid',
  width: 4,
};

describe('frame manager coords', () => {
  it('calculates frame coords from absolute iframe-aware element bounds', () => {
    const { iframe, target } = createIframeElementWithTarget();

    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ left: 200, top: 120, width: 400, height: 300 })
    );
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ left: 40, top: 30, width: 100, height: 50 })
    );

    expect(calculateFrameViewportCoords(target, testBorderSettings)).toEqual({
      x: 233,
      y: 144,
      width: 108,
      height: 59,
    });
  });

  it('keeps stored offsets stable for elements rendered inside iframes', () => {
    const { iframe, target } = createIframeElementWithTarget();

    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ left: 200, top: 120, width: 400, height: 300 })
    );
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ left: 40, top: 30, width: 100, height: 50 })
    );

    const expectedFrame = {
      x: 255,
      y: 166,
      width: 110,
      height: 60,
    };

    const offset = calculateFrameOffsetFromElement(expectedFrame, target);

    expect(offset).toEqual({
      x: 15,
      y: 16,
      width: 10,
      height: 10,
    });
    expect(applyFrameOffsetToElement(target, offset)).toEqual(expectedFrame);
  });
});
