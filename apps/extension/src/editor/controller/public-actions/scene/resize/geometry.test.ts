import type { Canvas } from 'fabric';
import { describe, expect, it } from 'vitest';

import type { EditorFrameSettings } from '../../../../../features/editor/document/types';

import { doesFrameGeometryChange, hasBrowserFrameLayer } from './geometry';

function createCanvas(objects?: Array<{ sniptaleType: string }>): Canvas {
  return (objects ? { getObjects: () => objects } : {}) as Canvas;
}

function createFrame(overrides: Partial<EditorFrameSettings> = {}): EditorFrameSettings {
  return {
    backgroundBlurAmount: 0,
    backgroundColor: '#fff',
    backgroundGradientAngle: 90,
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#ddd',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'color',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'expand-canvas',
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 16,
    ...overrides,
  };
}

describe('scene resize geometry', () => {
  it('detects browser frame objects on the canvas', () => {
    const canvas = createCanvas([{ sniptaleType: 'shape' }, { sniptaleType: 'browser-frame' }]);

    expect(hasBrowserFrameLayer(canvas)).toBe(true);
  });

  it('treats missing canvas objects as no browser frame layer', () => {
    expect(hasBrowserFrameLayer(null)).toBe(false);
    expect(hasBrowserFrameLayer(createCanvas())).toBe(false);
  });

  it('ignores visual-only frame changes', () => {
    expect(doesFrameGeometryChange(createFrame(), createFrame({ backgroundColor: '#000' }))).toBe(
      false
    );
  });

  it('detects layout and padding changes', () => {
    expect(doesFrameGeometryChange(createFrame(), createFrame({ layoutMode: 'fit-image' }))).toBe(
      true
    );
    expect(doesFrameGeometryChange(createFrame(), createFrame({ paddingLeft: 32 }))).toBe(true);
  });
});
