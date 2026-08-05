// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createCanvasContextStub } from './canvas-context.test.helpers';
import type { ViewerFrameProjection } from './canvas';
import { drawViewerDecorations } from './decoration';

function createProjection(visibility: { fillVisible: boolean; strokeVisible: boolean }) {
  const frame: FrameData = {
    borderSettings: {
      color: '#445566',
      customCss: '',
      fillColor: '#112233',
      fillOpacity: 25,
      sourcePresetId: 'border-1',
      inheritCustomCss: false,
      sourcePresetName: 'Border',
      opacity: 100,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 6,
      shadow: 0,
      strokeOpacity: 40,
      style: 'dashed',
      width: 4,
    },
    effectMode: 'border',
    height: 24,
    id: 'frame-1',
    width: 40,
    x: 10,
    y: 12,
  };
  return {
    frame,
    surface: {
      decorationVisible: visibility.fillVisible || visibility.strokeVisible,
      ...visibility,
      geometry: { height: 24, radius: 6, strokeWidth: 4, width: 40, x: 10, y: 12 },
    },
  } satisfies ViewerFrameProjection;
}

function createContext() {
  const order: string[] = [];
  const context = createCanvasContextStub({
    beginPath: vi.fn(() => order.push('beginPath')),
    fill: vi.fn(() => order.push('fill')),
    restore: vi.fn(() => order.push('restore')),
    roundRect: vi.fn(() => order.push('roundRect')),
    save: vi.fn(() => order.push('save')),
    setLineDash: vi.fn(),
    stroke: vi.fn(() => order.push('stroke')),
  });
  return { context, order };
}

it('draws percentage-opacity fill before the inward rounded stroke', () => {
  const { context, order } = createContext();

  drawViewerDecorations(context, [createProjection({ fillVisible: true, strokeVisible: true })]);

  expect(context.fillStyle).toBe('rgba(17, 34, 51, 0.25)');
  expect(context.strokeStyle).toBe('rgba(68, 85, 102, 0.4)');
  expect(context.lineWidth).toBe(4);
  expect(context.roundRect).toHaveBeenNthCalledWith(1, 10, 12, 40, 24, 6);
  expect(context.roundRect).toHaveBeenNthCalledWith(2, 12, 14, 36, 20, 4);
  expect(context.setLineDash).toHaveBeenCalledWith([12, 8]);
  expect(order.indexOf('fill')).toBeLessThan(order.indexOf('stroke'));
});

describe.each([
  { expectedFill: 0, expectedStroke: 0, fillVisible: false, strokeVisible: false },
  { expectedFill: 1, expectedStroke: 0, fillVisible: true, strokeVisible: false },
  { expectedFill: 0, expectedStroke: 1, fillVisible: false, strokeVisible: true },
])('decoration visibility $fillVisible/$strokeVisible', (testCase) => {
  it('draws only the canonical decoration layers enabled by the surface', () => {
    const { context } = createContext();

    drawViewerDecorations(context, [createProjection(testCase)]);

    expect(context.fill).toHaveBeenCalledTimes(testCase.expectedFill);
    expect(context.stroke).toHaveBeenCalledTimes(testCase.expectedStroke);
  });
});
