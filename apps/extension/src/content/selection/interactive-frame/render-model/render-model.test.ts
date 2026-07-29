// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { CSSProperties } from 'react';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
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

type CompositionCase = {
  effectMode: EffectMode;
  fillVisible: boolean;
  name: string;
  decorationVisible: boolean;
};

const compositionCases: CompositionCase[] = [
  { name: 'frame', effectMode: 'border', decorationVisible: true, fillVisible: false },
  { name: 'frame + fill', effectMode: 'border', decorationVisible: true, fillVisible: true },
  { name: 'blur', effectMode: 'blur', decorationVisible: false, fillVisible: false },
  { name: 'blur + frame', effectMode: 'blur', decorationVisible: true, fillVisible: false },
  { name: 'blur + frame + fill', effectMode: 'blur', decorationVisible: true, fillVisible: true },
  { name: 'mask', effectMode: 'focus', decorationVisible: false, fillVisible: false },
  { name: 'mask + frame', effectMode: 'focus', decorationVisible: true, fillVisible: false },
  { name: 'mask + frame + fill', effectMode: 'focus', decorationVisible: true, fillVisible: true },
];

function createCompositionFrame(testCase: CompositionCase): FrameData {
  return {
    ...baseFrame,
    effectMode: testCase.effectMode,
    borderSettings: {
      ...baseFrame.borderSettings!,
      fillOpacity: testCase.fillVisible ? 25 : 0,
    },
    ...(testCase.effectMode === 'blur'
      ? {
          blurSettings: {
            amount: 8,
            blurType: 'gaussian' as const,
            showBorder: testCase.decorationVisible,
          },
        }
      : {}),
    ...(testCase.effectMode === 'focus'
      ? {
          focusSettings: {
            opacity: 0.5,
            showBorder: testCase.decorationVisible,
          },
        }
      : {}),
  };
}

function getLayerGeometry(style: CSSProperties) {
  return {
    position: style.position,
    inset: style.inset,
    width: style.width,
    height: style.height,
    boxSizing: style.boxSizing,
    borderRadius: style.borderRadius,
  };
}

describe('interactive-frame render model', () => {
  it.each(compositionCases)('projects $name onto the same canonical surface', (testCase) => {
    const frame = createCompositionFrame(testCase);
    const display = getInteractiveFrameDisplay({
      frame,
      currentFrame: frame,
      effectMode: testCase.effectMode,
      state: 'idle',
      zIndex: 41,
    });

    expect(display.frameStyle).toMatchObject({
      width: '160px',
      height: '90px',
      boxSizing: 'border-box',
      border: 'none',
      background: 'transparent',
    });
    expect(display.fillStyle).toMatchObject({
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      border: 'none',
      borderRadius: '8px',
      backgroundColor: testCase.fillVisible ? 'rgba(22, 163, 74, 0.25)' : 'transparent',
    });
    expect(display.strokeStyle).toMatchObject({
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      border: testCase.decorationVisible ? '5px dashed rgba(37, 99, 235, 0.4)' : 'none',
      borderRadius: '8px',
      background: 'transparent',
    });
    expect(display.frameZIndex).toBe(41);
  });

  it.each(['blur', 'focus'] as const)(
    'changes only decoration paint when %s decoration is toggled',
    (effectMode) => {
      const hiddenFrame = createCompositionFrame({
        name: effectMode,
        effectMode,
        decorationVisible: false,
        fillVisible: true,
      });
      const visibleFrame = createCompositionFrame({
        name: `${effectMode} + frame + fill`,
        effectMode,
        decorationVisible: true,
        fillVisible: true,
      });
      const hidden = getInteractiveFrameDisplay({
        frame: hiddenFrame,
        currentFrame: hiddenFrame,
        effectMode,
        state: 'editing',
        zIndex: 3,
      });
      const visible = getInteractiveFrameDisplay({
        frame: visibleFrame,
        currentFrame: visibleFrame,
        effectMode,
        state: 'editing',
        zIndex: 3,
      });

      expect(hidden.frameStyle).toEqual(visible.frameStyle);
      expect(getLayerGeometry(hidden.fillStyle)).toEqual(getLayerGeometry(visible.fillStyle));
      expect(getLayerGeometry(hidden.strokeStyle)).toEqual(getLayerGeometry(visible.strokeStyle));
      expect(hidden.fillStyle.backgroundColor).toBe('transparent');
      expect(hidden.strokeStyle.border).toBe('none');
      expect(visible.fillStyle.backgroundColor).toBe('rgba(22, 163, 74, 0.25)');
      expect(visible.strokeStyle.border).toBe('5px dashed rgba(37, 99, 235, 0.4)');
      expect(hidden.frameZIndex).toBe(2147483644);
      expect(visible.frameZIndex).toBe(2147483644);
    }
  );

  it('keeps custom CSS inside the canonical fill geometry and paint contract', () => {
    const frame: FrameData = {
      ...baseFrame,
      borderSettings: {
        ...baseFrame.borderSettings!,
        customCss: [
          'background-color: rgb(1, 2, 3)',
          'background-image: linear-gradient(red, blue)',
          'border: 20px solid red',
          'border-radius: 50px',
          'outline: 4px solid blue',
          'clip-path: inset(10px)',
          'box-shadow: inset 0 0 0 1px rgb(1, 2, 3)',
        ].join('; '),
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

    expect(display.frameStyle).toMatchObject({
      width: '160px',
      height: '90px',
      boxSizing: 'border-box',
      border: 'none',
      background: 'transparent',
    });
    expect(display.fillStyle).toMatchObject({
      inset: 0,
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      border: 'none',
      borderRadius: '8px',
      outline: 'none',
      clipPath: 'none',
      backgroundColor: 'rgb(1, 2, 3)',
      backgroundImage: 'linear-gradient(red, blue)',
      boxShadow: 'inset 0 0 0 1px rgb(1, 2, 3)',
    });
    expect(display.strokeStyle.border).toBe('5px dashed rgba(37, 99, 235, 0.4)');
  });
});
