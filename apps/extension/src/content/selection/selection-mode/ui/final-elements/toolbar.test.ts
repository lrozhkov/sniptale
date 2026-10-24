// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';
import {
  createContentSizeTooltipDom,
  setContentSizeTooltipPosition,
} from '@sniptale/ui/content-size-tooltip/dom';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../../features/quick-actions-presets/catalog', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../features/quick-actions-presets/catalog')
  >()),
  getCaptureActionDescriptors: () => [
    { value: 'download_default', label: 'Download', hint: 'Download file' },
    { value: 'copy', label: 'Copy', hint: 'Copy image' },
    { value: 'scenario', label: 'Scenario', hint: 'Add to scenario' },
    { value: 'edit', label: 'Edit', hint: 'Open editor' },
    { value: 'ask_system', label: 'Save as', hint: 'Choose system folder' },
    { value: 'ask_preset', label: 'Choose preset', hint: 'Choose preset folder' },
    { value: 'save_to_library', label: 'Library', hint: 'Save to library' },
  ],
}));

import { enhanceSelectionModeToolbar, syncSelectionToolbarPaddingState } from './toolbar';
import { closeSelectionCaptureActionMenu } from './capture-menu';
import { applySelectionToolbarSurfaceChrome } from './toolbar-chrome';
import { bindSelectionWidthInput } from '../size-panel/inputs';
import { handleSelectionModeClick, handleSelectionModeKeyDown } from '../../events/commands';
import { isSelectionModeExtensionUiElement } from '../../runtime/extension-ui';
import { createSelectionModeSession } from '../../session';
import type { SelectionModeEventOptions } from '../../events/types';

const copy = {
  cancel: 'Cancel',
  confirm: 'Confirm',
  decreaseHeight: 'Decrease height',
  decreaseWidth: 'Decrease width',
  heightField: 'Height',
  increaseHeight: 'Increase height',
  increaseWidth: 'Increase width',
  keepAspectRatio: 'Keep aspect ratio',
  widthField: 'Width',
};

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
});

it('lets the capture label inherit quiet command weight for hover changes', () => {
  const { tooltip } = createToolbar();
  const label = tooltip.confirmButton.querySelector<HTMLElement>(
    '.sniptale-selection-capture-action-label'
  );
  expect(label?.textContent).toBe('Download');
  expect(label?.style.fontWeight).toBe('inherit');
});

function createToolbar(
  selection = { x: 20, y: 20, width: 100, height: 80 },
  mountInto: HTMLElement | ShadowRoot = document.body,
  captureAction: 'download_default' | 'scenario' = 'download_default'
) {
  const overlayContainer = document.createElement('div');
  mountInto.appendChild(overlayContainer);
  const tooltip = createContentSizeTooltipDom({
    copy,
    heightMax: 720,
    heightMin: 10,
    maintainAspectRatio: false,
    mountInto: overlayContainer,
    variant: 'frame-edit',
    widthMax: 1280,
    widthMin: 10,
  });
  const onAdjustPadding = vi.fn();
  const onCaptureActionChange = vi.fn();
  const onConfirm = vi.fn();
  enhanceSelectionModeToolbar(tooltip, {
    getCaptureAction: () => captureAction,
    getSelection: () => selection,
    onAdjustPadding,
    onCaptureActionChange,
    onConfirm,
    overlayContainer,
  });
  return { onAdjustPadding, onCaptureActionChange, onConfirm, overlayContainer, tooltip };
}

function createCaptureGuardOptions(): SelectionModeEventOptions {
  return {
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
}

describe('selection-mode confirmed toolbar', () => {
  it.each([false, true])(
    'commits an under-min dimension draft before pointer commands in shadow=%s',
    (shadow) => {
      const host = document.createElement('div');
      document.body.append(host);
      const mountInto = shadow ? host.attachShadow({ mode: 'open' }) : host;
      const { tooltip } = createToolbar(undefined, mountInto);
      let selection = { x: 20, y: 20, width: 100, height: 80 };
      bindSelectionWidthInput(
        tooltip.widthInput,
        tooltip.heightInput,
        (next) => {
          selection = next;
        },
        {
          minSelectionSize: 10,
          maxWidth: 1280,
          maxHeight: 720,
          getCurrentSelection: () => selection,
          getMaintainAspectRatio: () => false,
          getAspectRatio: () => null,
        }
      );
      tooltip.widthInput.focus();
      tooltip.widthInput.value = '5';
      tooltip.widthInput.dispatchEvent(new Event('input', { bubbles: true }));
      expect(selection.width).toBe(100);
      tooltip.confirmButton.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
        })
      );
      expect(tooltip.widthInput.value).toBe('10');
      expect(selection.width).toBe(10);
      expect(tooltip.widthInput.matches(':focus')).toBe(false);
    }
  );

  it('releases the legacy inline minimum height to the adopted shell geometry', () => {
    const overlayContainer = document.createElement('div');
    document.body.append(overlayContainer);
    const tooltip = createContentSizeTooltipDom({
      copy,
      heightMax: 720,
      heightMin: 10,
      maintainAspectRatio: false,
      mountInto: overlayContainer,
      variant: 'frame-edit',
      widthMax: 1280,
      widthMin: 10,
    });
    expect(tooltip.root.style.minHeight).toBe('44px');
    applySelectionToolbarSurfaceChrome(tooltip.root);
    expect(tooltip.root.style.minHeight).toBe('');
  });

  it('cancels enabled pointer button focus without changing inputs or keyboard activation', () => {
    const { tooltip } = createToolbar();
    applySelectionToolbarSurfaceChrome(tooltip.root);
    const button = document.createElement('button');
    tooltip.root.append(button);
    button.focus();
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.activeElement).not.toBe(button);
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    const preventDefault = vi.spyOn(mouseDown, 'preventDefault');
    button.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    const secondaryMouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    button.dispatchEvent(secondaryMouseDown);
    expect(secondaryMouseDown.defaultPrevented).toBe(false);
    const inputMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    tooltip.widthInput.dispatchEvent(inputMouseDown);
    expect(inputMouseDown.defaultPrevented).toBe(false);
    button.focus();
    const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
    button.dispatchEvent(enter);
    expect(document.activeElement).toBe(button);
    expect(enter.defaultPrevented).toBe(false);
    button.disabled = true;
    const disabledMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(disabledMouseDown);
    expect(disabledMouseDown.defaultPrevented).toBe(false);
  });

  it('uses the compact frame toolbar and groups symmetric padding controls between dividers', () => {
    const { onAdjustPadding, tooltip } = createToolbar();

    expect(tooltip.root.dataset['variant']).toBe('frame-edit');
    expect(tooltip.root.classList).toContain('sniptale-glass-toolbar');
    expect(tooltip.root.classList).toContain('sniptale-toolbar-root');
    expect(tooltip.root.style.width).toBe('max-content');
    expect(tooltip.root.querySelectorAll('.sniptale-glass-toolbar-divider')).toHaveLength(3);
    expect(tooltip.cancelButton.previousElementSibling?.classList).toContain(
      'sniptale-glass-toolbar-divider'
    );

    const decrease = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-padding-decrease'
    );
    const increase = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-padding-increase'
    );
    expect(decrease?.classList).toContain('sniptale-glass-toolbar-button');
    expect(increase?.classList).toContain('sniptale-glass-toolbar-button');
    expect(decrease?.textContent).toBe('');
    expect(increase?.textContent).toBe('');
    expect(decrease?.querySelector('svg')?.style.display).toBe('block');
    expect(increase?.querySelector('svg')?.style.display).toBe('block');
    expect(tooltip.cancelButton.classList).toContain('sniptale-glass-toolbar-button');
    expect(
      Array.from(tooltip.root.querySelectorAll('button')).every((button) =>
        button.classList.contains('sniptale-glass-toolbar-button')
      )
    ).toBe(true);
    expect(tooltip.widthDecreaseButton.style.width).toBe('22px');
    expect(tooltip.aspectRatioButton.style.width).toBe('30px');
    expect(getComputedStyle(tooltip.widthDecreaseButton).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(tooltip.aspectRatioButton.style.background).toBe('');
    expect(tooltip.widthDecreaseButton.getAttribute('style')).not.toContain('border:');
    expect(tooltip.heightIncreaseButton.getAttribute('style')).not.toContain('border:');
    expect(tooltip.aspectRatioButton.classList).not.toContain(
      'sniptale-glass-toolbar-button--active'
    );
    expect(tooltip.aspectRatioButton.querySelector('svg path')?.getAttribute('d')).toBe(
      'M9 17H7A5 5 0 0 1 7 7h2'
    );
    expect(tooltip.aspectRatioButton.querySelector('svg line')?.getAttribute('x1')).toBe('8');
    expect(tooltip.actions.firstElementChild?.contains(tooltip.confirmButton)).toBe(true);
    expect(tooltip.actions.lastElementChild).toBe(tooltip.cancelButton);
    expect(tooltip.cancelButton.nextElementSibling).toBeNull();

    decrease?.click();
    increase?.click();

    expect(onAdjustPadding.mock.calls).toEqual([['decrease'], ['increase']]);
  });

  it('shows a neutral primary action label and hides alternatives for scenario', () => {
    const regular = createToolbar();
    expect(regular.tooltip.confirmButton.textContent).toBe('Download');
    expect(regular.tooltip.confirmButton.classList).not.toContain(
      'sniptale-glass-toolbar-button--active'
    );
    expect(regular.tooltip.confirmButton.classList).toContain(
      'sniptale-content-size-tooltip-primary-action'
    );
    expect(regular.tooltip.confirmButton.style.background).toBe('');
    expect(regular.tooltip.confirmButton.style.border).toBe('');
    expect(
      regular.tooltip.root.querySelector('.sniptale-selection-capture-menu-trigger')
    ).not.toBeNull();

    const scenario = createToolbar(
      { x: 20, y: 20, width: 100, height: 80 },
      document.body,
      'scenario'
    );
    const scenarioIconPath = scenario.tooltip.confirmButton.querySelector('svg path');
    expect(scenario.tooltip.confirmButton.textContent).toBe('Scenario');
    expect(scenarioIconPath?.getAttribute('d')).toBe(
      'M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1'
    );
    expect(
      scenario.tooltip.root.querySelector('.sniptale-selection-capture-menu-trigger')
    ).toBeNull();
    expect(scenario.tooltip.confirmButton.style.borderRadius).toBe('var(--sniptale-radius)');
  });

  it('disables the full shrink step when either dimension would cross the minimum', () => {
    const { onAdjustPadding, tooltip } = createToolbar({ x: 20, y: 20, width: 19, height: 80 });
    const decrease = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-padding-decrease'
    );

    expect(decrease?.disabled).toBe(true);
    decrease?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onAdjustPadding).not.toHaveBeenCalled();
  });

  it('disables growth when any viewport edge lacks the complete five-pixel step', () => {
    const { tooltip } = createToolbar({ x: 2, y: 20, width: 100, height: 80 });

    expect(
      tooltip.root.querySelector<HTMLButtonElement>('.sniptale-selection-padding-increase')
        ?.disabled
    ).toBe(true);
  });

  it('preserves composed max-content sizing after clamped edge positioning', () => {
    const { tooltip } = createToolbar();
    const position = calculateContentSizeTooltipPosition({
      anchorRect: { x: 1210, y: 100, width: 60, height: 80 },
      tooltipHeight: 44,
      tooltipWidth: 420,
      viewportHeight: 720,
      viewportWidth: 1280,
    });

    setContentSizeTooltipPosition(tooltip.root, position);

    expect(tooltip.root.style.width).toBe('max-content');
    expect(tooltip.root.style.minWidth).toBe('0px');
    expect(position.x + 420).toBeLessThanOrEqual(1268);
  });

  it('allows selection state to sync before toolbar controls are mounted', () => {
    expect(() =>
      syncSelectionToolbarPaddingState(document.createDocumentFragment(), {
        x: 20,
        y: 20,
        width: 100,
        height: 80,
      })
    ).not.toThrow();
  });
});

describe('selection-mode capture menu placement and density', () => {
  it.each([100, 600])('matches the main mode-menu shell gap at y=%s', (top) => {
    const { tooltip, overlayContainer } = createToolbar();
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );
    if (!trigger) throw new Error('Expected capture-menu trigger');
    vi.spyOn(tooltip.root, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, top, 400, 46));
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(450, top + 7, 18, 32));
    trigger.click();
    const menu = overlayContainer.querySelector<HTMLElement>('.sniptale-selection-capture-menu');
    const below = top === 100;
    expect(menu?.classList).toContain('sniptale-content-menu-adopted');
    expect(Number.parseFloat(menu?.style.top ?? '')).toBe(below ? top + 46 + 1 : top - 1 - 84);
    expect(trigger.dataset['menuSide']).toBe(below ? 'down' : 'up');
    expect(trigger.style.width).toBe('18px');
  });

  it.each([220, 300])(
    'compacts before limiting the capture list height (%s px)',
    (compactHeight) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 560 });
      const { tooltip, overlayContainer } = createToolbar();
      const trigger = tooltip.root.querySelector<HTMLButtonElement>(
        '.sniptale-selection-capture-menu-trigger'
      )!;
      const measure = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          if (this === tooltip.root) return new DOMRect(100, 220, 400, 46);
          if (this === trigger) return new DOMRect(450, 227, 18, 32);
          const height = this.classList.contains('sniptale-toolbar-menu--compact')
            ? compactHeight
            : 400;
          return new DOMRect(0, 0, 280, height);
        });
      try {
        trigger.click();
        const menu = overlayContainer.querySelector<HTMLElement>(
          '.sniptale-selection-capture-menu'
        )!;
        expect(trigger.dataset['menuSide']).toBe('down');
        expect(menu.classList).toContain('sniptale-toolbar-menu--compact');
        expect(menu.style.top).toBe('267px');
        expect(menu.style.maxHeight).toBe('285px');
        expect(menu.style.overflowY).toBe('auto');
      } finally {
        measure.mockRestore();
      }
    }
  );
});

describe('selection-mode capture action menu', () => {
  it('lets menu items pass the real document-capture guard and update the split action', () => {
    const { onCaptureActionChange, onConfirm, overlayContainer, tooltip } = createToolbar();
    const state = createSelectionModeSession();
    state.isActive = true;
    state.currentState = 'confirmed';
    const guardOptions = createCaptureGuardOptions();
    const captureGuard = (event: MouseEvent) => {
      handleSelectionModeClick(event, state, guardOptions);
    };
    document.addEventListener('click', captureGuard, true);
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );

    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const menu = overlayContainer.querySelector('.sniptale-selection-capture-menu');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('.sniptale-toolbar-menu-title')?.textContent).toBe(
      'content.toolbar.selectionCaptureActionTitle'
    );
    expect(menu?.querySelector('[data-ui$=".scenario"]')).toBeNull();
    const row = menu?.querySelector('.sniptale-capture-action-icons');
    const icons = Array.from(row?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    expect(icons).toHaveLength(6);
    expect(icons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Download',
      'Copy',
      'Edit',
      'Save as',
      'Choose preset',
      'Library',
    ]);
    for (const button of icons) {
      expect(button.title).toBe(button.getAttribute('aria-label'));
      expect(button.classList).toContain('sniptale-capture-action-icon');
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.textContent).toBe('');
    }

    const copyEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    menu?.querySelector<HTMLButtonElement>('[data-ui$=".copy"]')?.dispatchEvent(copyEvent);
    document.removeEventListener('click', captureGuard, true);

    expect(onCaptureActionChange).toHaveBeenCalledWith('copy');
    expect(onConfirm).toHaveBeenCalledWith(copyEvent);
    expect(menu?.isConnected).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('owns initial focus, outside dismissal, and focus restoration', () => {
    const { overlayContainer, tooltip } = createToolbar();
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );
    trigger?.click();

    const firstItem = overlayContainer.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(firstItem);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(overlayContainer.querySelector('.sniptale-selection-capture-menu')).toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.click();
    expect(closeSelectionCaptureActionMenu(overlayContainer, true)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses Capture on Escape without the crop keyboard handler and restores trigger focus', () => {
    const { overlayContainer, tooltip, onConfirm } = createToolbar();
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    )!;
    trigger.click();
    const firstItem = overlayContainer.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    firstItem.dispatchEvent(escape);
    expect(overlayContainer.querySelector('.sniptale-selection-capture-menu')).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps pointer interaction inside a shadow-root menu through mousedown and click', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const { onCaptureActionChange, overlayContainer, tooltip } = createToolbar(
      undefined,
      shadowRoot
    );
    const state = createSelectionModeSession();
    state.isActive = true;
    state.currentState = 'confirmed';
    const guardOptions = createCaptureGuardOptions();
    const captureGuard = (event: MouseEvent) =>
      handleSelectionModeClick(event, state, guardOptions);
    document.addEventListener('click', captureGuard, true);
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );

    trigger?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    );
    const menu = overlayContainer.querySelector<HTMLElement>('.sniptale-selection-capture-menu');
    const copyAction = menu?.querySelector<HTMLButtonElement>('[data-ui$=".copy"]');
    expect(menu?.style.pointerEvents).toBe('auto');

    copyAction?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true })
    );
    expect(menu?.isConnected).toBe(true);
    copyAction?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    );
    document.removeEventListener('click', captureGuard, true);

    expect(onCaptureActionChange).toHaveBeenCalledWith('copy');
    expect(menu?.isConnected).toBe(false);
  });

  it('uses roving menu focus and closes when keyboard focus tabs away', () => {
    const { overlayContainer, tooltip } = createToolbar();
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );
    trigger?.click();
    const menu = overlayContainer.querySelector<HTMLElement>('.sniptale-selection-capture-menu');
    const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

    expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    expect(document.activeElement).toBe(items[1]);
    items[1]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    expect(document.activeElement).toBe(items[5]);
    items[5]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    expect(document.activeElement).toBe(items[0]);
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    expect(document.activeElement).toBe(items[5]);
    items[5]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    expect(document.activeElement).toBe(items[0]);
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    expect(document.activeElement).toBe(items[5]);

    const tabEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    items[5]?.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
    expect(menu?.isConnected).toBe(false);
  });

  it('preserves native Enter activation for a menu item across the production shadow boundary', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const { onCaptureActionChange, overlayContainer, tooltip } = createToolbar(
      undefined,
      shadowRoot
    );
    const state = createSelectionModeSession();
    state.isActive = true;
    state.currentState = 'confirmed';
    const guardOptions = createCaptureGuardOptions();
    const keyGuard = (event: KeyboardEvent) =>
      handleSelectionModeKeyDown(event, state, guardOptions);
    document.addEventListener('keydown', keyGuard, true);
    tooltip.root
      .querySelector<HTMLButtonElement>('.sniptale-selection-capture-menu-trigger')
      ?.click();
    const copyAction = overlayContainer.querySelector<HTMLButtonElement>('[data-ui$=".copy"]');
    copyAction?.focus();
    const enterEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: 'Enter',
    });

    copyAction?.dispatchEvent(enterEvent);
    copyAction?.click();
    document.removeEventListener('keydown', keyGuard, true);

    expect(guardOptions.confirmSelection).not.toHaveBeenCalled();
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(onCaptureActionChange).toHaveBeenCalledWith('copy');
  });

  it('reclamps the open menu on viewport changes and removes the positioning lifecycle on close', () => {
    const { overlayContainer, tooltip } = createToolbar();
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );
    if (!trigger) throw new Error('Expected capture-menu trigger');
    const anchorRectSpy = vi
      .spyOn(trigger, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(1200, 100, 24, 32));

    trigger.click();
    const menu = overlayContainer.querySelector<HTMLElement>('.sniptale-selection-capture-menu');
    expect(menu?.style.left).toBe('1012px');

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    window.dispatchEvent(new Event('resize'));
    expect(menu?.style.left).toBe('232px');
    expect(anchorRectSpy).toHaveBeenCalledTimes(2);

    trigger.click();
    window.dispatchEvent(new Event('resize'));
    expect(anchorRectSpy).toHaveBeenCalledTimes(2);
  });
});
