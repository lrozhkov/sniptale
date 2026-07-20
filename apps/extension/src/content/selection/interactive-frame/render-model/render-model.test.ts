// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { getInteractiveFrameDisplay } from './render-model';

const baseFrame: FrameData = {
  id: 'frame-1',
  x: 12,
  y: 24,
  width: 160,
  height: 90,
  effectMode: 'border',
  borderSettings: {
    id: 'border-1',
    name: 'Primary',
    order: 0,
    color: '#2563eb',
    customCss: '',
    fillColor: '#16a34a',
    fillOpacity: 25,
    opacity: 75,
    inheritCustomCss: true,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
    radius: 8,
    shadow: 30,
    strokeOpacity: 40,
    style: 'dashed',
    width: 5,
  },
};

function expectIdleBorderDisplay() {
  const display = getInteractiveFrameDisplay({
    frame: baseFrame,
    currentFrame: baseFrame,
    effectMode: 'border',
    state: 'idle',
    zIndex: 41,
  });

  expect(display.borderColor).toBe('#2563eb');
  expect(display.borderWidth).toBe(5);
  expect(display.frameStyle.backgroundColor).toBe('rgba(22, 163, 74, 0.25)');
  expect(display.frameStyle.border).toBe('5px dashed rgba(37, 99, 235, 0.4)');
  expect(display.frameStyle.opacity).toBe(1);
  expect(display.frameZIndex).toBe(41);
}

function expectAdditionalCssOverride() {
  const frame: FrameData = {
    ...baseFrame,
    borderSettings: {
      ...baseFrame.borderSettings!,
      customCss:
        'background-color: rgb(1, 2, 3); box-shadow: inset 0 0 0 1px rgb(1, 2, 3); outline-offset: 3px;',
      inheritCustomCss: true,
      shadow: 0,
    },
  };

  const display = getInteractiveFrameDisplay({
    frame,
    currentFrame: frame,
    effectMode: 'border',
    state: 'idle',
    zIndex: 4,
  });

  expect(display.frameStyle.backgroundColor).toBe('rgb(1, 2, 3)');
  expect(display.frameStyle.boxShadow).toBe('inset 0 0 0 1px rgb(1, 2, 3)');
  expect(display.frameStyle.outlineOffset).toBe('3px');
}

function expectEditingBlueSelectionBorder() {
  const frame: FrameData = {
    ...baseFrame,
    blurSettings: { amount: 8, blurType: 'gaussian', showBorder: false },
  };

  const display = getInteractiveFrameDisplay({
    frame,
    currentFrame: frame,
    effectMode: 'blur',
    state: 'editing',
    zIndex: 3,
  });

  expect(display.borderColor).toBe('#2563eb');
  expect(display.borderWidth).toBe(2);
  expect(display.frameStyle.border).toBe('2px solid rgba(37, 99, 235, 1)');
  expect(display.frameStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(display.frameZIndex).toBe(2147483644);
}

describe('interactive-frame render model', () => {
  it('builds border display from frame settings in idle mode', expectIdleBorderDisplay);
  it(
    'lets additional css override the installed-frame visual contract',
    expectAdditionalCssOverride
  );
  it(
    'uses the fixed blue selection border while editing even in blur mode',
    expectEditingBlueSelectionBorder
  );
});
