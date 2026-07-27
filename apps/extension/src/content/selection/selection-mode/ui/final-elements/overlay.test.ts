// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSelectionModeClick } from '../../events/commands';
import { isSelectionModeExtensionUiElement } from '../../runtime/extension-ui';
import { createSelectionModeSession } from '../../session';
import { OVERLAY_BACKGROUND } from '../../constants';
import {
  createSelectionModeDragOverlay,
  createSelectionModeFinalOverlay,
  resolveSelectionModeDragMaskBackground,
} from './overlay';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';

beforeEach(() => {
  document.body.replaceChildren();
});

function createOptions() {
  return {
    zIndexBase: 400,
    overlayBackground: 'rgba(0, 0, 0, 0.55)',
    minSelectionSize: 100,
    getMaxSelectionWidth: () => 1280,
    getMaxSelectionHeight: () => 720,
    getCaptureAction: () => 'download_default' as const,
    getSelection: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    onAdjustPadding: vi.fn(),
    onCaptureActionChange: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onResetToIdle: vi.fn(),
    onSetupSizePanelListeners: vi.fn(),
    visual: createSelectionVisual(),
  };
}

function createSelectionVisual(): ResolvedBorderPresetVisual {
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
    strokeColor: '#0ea5e9',
    strokeOpacity: 100,
    strokeStyle: 'solid',
    strokeWidth: 2,
  };
}

describe('selection-mode final overlay', () => {
  it.each([
    ['dark', 'rgba(9, 9, 11, 0.656)'],
    ['light', 'rgba(240, 233, 226, 0.574)'],
  ] as const)(
    'resolves the production mask expression once for the %s canvas theme',
    (theme, resolvedBackground) => {
      const container = document.createElement('div');
      container.dataset['theme'] = theme;
      document.body.appendChild(container);
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation((node) => {
          expect(node.parentElement).toBe(container);
          expect((node as HTMLElement).style.background).toBe(OVERLAY_BACKGROUND);
          return { backgroundColor: resolvedBackground } as CSSStyleDeclaration;
        });

      expect(resolveSelectionModeDragMaskBackground(container, OVERLAY_BACKGROUND)).toBe(
        resolvedBackground
      );
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
      expect(container.childElementCount).toBe(0);
      getComputedStyleSpy.mockRestore();
    }
  );

  it('creates a canvas-backed drag mask without layout-driven shade elements', () => {
    const overlay = createSelectionModeDragOverlay('rgba(0, 0, 0, 0.55)');

    expect(overlay).toBeInstanceOf(HTMLCanvasElement);
    expect(overlay.className).toBe('sniptale-selection-drag-overlay');
    expect(overlay.querySelectorAll('.sniptale-shade')).toHaveLength(0);
    expect(overlay.querySelector('.sniptale-selection-event-catcher')).toBeNull();
    expect(overlay.style.display).toBe('none');
    expect(overlay.dataset['overlayBackground']).toBe('rgba(0, 0, 0, 0.55)');
  });

  it('creates shades and a reset catcher', () => {
    const options = createOptions();
    const overlay = createSelectionModeFinalOverlay(options);

    expect(overlay.className).toBe('sniptale-selection-final-overlay');
    expect(overlay.querySelectorAll('.sniptale-shade')).toHaveLength(4);
    expect(overlay.querySelector('.sniptale-shade-top')).not.toBeNull();
    expect(overlay.querySelector('.sniptale-shade-bottom')).not.toBeNull();
    expect(overlay.querySelector('.sniptale-shade-left')).not.toBeNull();
    expect(overlay.querySelector('.sniptale-shade-right')).not.toBeNull();

    overlay
      .querySelector<HTMLElement>('.sniptale-selection-event-catcher')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(options.onResetToIdle).toHaveBeenCalledTimes(1);
  });

  it('lets the reset catcher reach its owner through the production shadow capture guard', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const options = createOptions();
    const overlay = createSelectionModeFinalOverlay(options);
    shadowRoot.appendChild(overlay);
    const state = createSelectionModeSession();
    state.isActive = true;
    state.currentState = 'confirmed';
    const guardOptions = {
      cancelSelection: vi.fn(),
      closeCaptureActionMenu: vi.fn(() => false),
      confirmSelection: vi.fn(),
      finalizeDragSelection: vi.fn(),
      flushFinalFrameUpdate: vi.fn(),
      handleDragMove: vi.fn(),
      handleResizeMove: vi.fn(),
      hideHoverFrame: vi.fn(),
      isExtensionUIElement: isSelectionModeExtensionUiElement,
      resetToIdleState: vi.fn(),
      selectElement: vi.fn(),
      showHoverFrame: vi.fn(),
      startDragSelection: vi.fn(),
      updateDragSelection: vi.fn(),
    };
    const captureGuard = (event: MouseEvent) => {
      handleSelectionModeClick(event, state, guardOptions);
    };
    document.addEventListener('click', captureGuard, true);

    overlay
      .querySelector<HTMLElement>('.sniptale-selection-event-catcher')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    document.removeEventListener('click', captureGuard, true);

    expect(options.onResetToIdle).toHaveBeenCalledTimes(1);
    expect(guardOptions.resetToIdleState).not.toHaveBeenCalled();
  });
});
