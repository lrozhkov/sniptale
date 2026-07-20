// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { createSelectionModeFinalFrame, createSelectionModeFinalResizeHandles } from './frame';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';

beforeEach(() => {
  document.body.replaceChildren();
});

function createSelectionVisual(
  overrides: Partial<ResolvedBorderPresetVisual> = {}
): ResolvedBorderPresetVisual {
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
    strokeWidth: 3,
    ...overrides,
  };
}

describe('selection-mode final frame', () => {
  it('creates the frame shell and the eight resize handles', () => {
    const frame = createSelectionModeFinalFrame({
      zIndexBase: 500,
      overlayBackground: 'rgba(0, 0, 0, 0.4)',
      minSelectionSize: 100,
      getMaxSelectionWidth: () => 1280,
      getMaxSelectionHeight: () => 720,
      onConfirm: () => {},
      onResetToIdle: () => {},
      onSetupSizePanelListeners: () => {},
      visual: createSelectionVisual(),
    });

    createSelectionModeFinalResizeHandles(frame, '#38bdf8');

    expect(frame.className).toBe('sniptale-selection-final-frame');
    expect(frame.querySelectorAll('.sniptale-resize-handle')).toHaveLength(8);
    expect(frame.querySelector('.sniptale-resize-handle[data-direction="nw"]')).not.toBeNull();
    expect(frame.querySelector('.sniptale-resize-handle[data-direction="se"]')).not.toBeNull();
  });

  it('applies the expected cursor and outline styles to the shell and handles', () => {
    const frame = createSelectionModeFinalFrame({
      zIndexBase: 500,
      overlayBackground: 'rgba(0, 0, 0, 0.4)',
      minSelectionSize: 80,
      getMaxSelectionWidth: () => 1280,
      getMaxSelectionHeight: () => 720,
      onConfirm: () => {},
      onResetToIdle: () => {},
      onSetupSizePanelListeners: () => {},
      visual: createSelectionVisual({
        strokeColor: '#ef4444',
        strokeWidth: 2,
      }),
    });

    createSelectionModeFinalResizeHandles(frame, '#ef4444');

    expect(frame.style.cssText).toContain('cursor: move');
    expect(frame.style.cssText).toContain('border: 2px solid rgb(239, 68, 68)');
    expect(
      frame.querySelector<HTMLElement>('.sniptale-resize-handle[data-direction="e"]')?.style.cssText
    ).toContain('cursor: ew-resize');
  });
});
