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
    fillCss: '#22c55e',
    id: 'preset-1',
    inheritCustomCss: false,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 30,
    strokeColor: '#38bdf8',
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
      getCaptureAction: () => 'download_default',
      getSelection: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      onAdjustPadding: () => {},
      onCaptureActionChange: () => {},
      onCancel: () => {},
      onConfirm: () => {},
      onResetToIdle: () => {},
      onSetupSizePanelListeners: () => {},
      visual: createSelectionVisual(),
    });

    createSelectionModeFinalResizeHandles(frame, '#38bdf8', 3);

    expect(frame.className).toBe('sniptale-selection-final-frame');
    expect(frame.querySelectorAll('.sniptale-resize-handle')).toHaveLength(8);
    expect(frame.querySelector('.sniptale-resize-handle[data-direction="nw"]')).not.toBeNull();
    expect(frame.querySelector('.sniptale-resize-handle[data-direction="se"]')).not.toBeNull();
    const handle = frame.querySelector<HTMLElement>('.sniptale-resize-handle');
    expect(handle?.style.borderRadius).toBe('50%');
    expect(handle?.style.background).toBe('rgb(255, 255, 255)');
    expect(handle?.style.width).toBe('11px');
    expect(handle?.style.top).toBe('-5.5px');
    expect(handle?.style.left).toBe('-5.5px');
  });

  it('applies the expected cursor and outline styles to the shell and handles', () => {
    const frame = createSelectionModeFinalFrame({
      zIndexBase: 500,
      overlayBackground: 'rgba(0, 0, 0, 0.4)',
      minSelectionSize: 80,
      getMaxSelectionWidth: () => 1280,
      getMaxSelectionHeight: () => 720,
      getCaptureAction: () => 'download_default',
      getSelection: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      onAdjustPadding: () => {},
      onCaptureActionChange: () => {},
      onCancel: () => {},
      onConfirm: () => {},
      onResetToIdle: () => {},
      onSetupSizePanelListeners: () => {},
      visual: createSelectionVisual({
        strokeColor: '#ef4444',
        strokeWidth: 2,
      }),
    });

    createSelectionModeFinalResizeHandles(frame, '#ef4444', 2);

    expect(frame.style.cssText).toContain('cursor: move');
    expect(frame.style.cssText).toContain('border: 2px solid rgb(239, 68, 68)');
    expect(
      frame.querySelector<HTMLElement>('.sniptale-resize-handle[data-direction="e"]')?.style.cssText
    ).toContain('cursor: ew-resize');
    expect(
      frame.querySelector<HTMLElement>('.sniptale-resize-handle[data-direction="ne"]')?.style.top
    ).toBe('-5px');
    expect(
      frame.querySelector<HTMLElement>('.sniptale-resize-handle[data-direction="ne"]')?.style.right
    ).toBe('-5px');
  });
});
