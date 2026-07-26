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
  ],
}));

import { enhanceSelectionModeToolbar } from './toolbar';
import { closeSelectionCaptureActionMenu } from './capture-menu';
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

function createToolbar(
  selection = { x: 20, y: 20, width: 100, height: 80 },
  mountInto: HTMLElement | ShadowRoot = document.body
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
  enhanceSelectionModeToolbar(tooltip, {
    getCaptureAction: () => 'download_default',
    getSelection: () => selection,
    onAdjustPadding,
    onCaptureActionChange,
    overlayContainer,
  });
  return { onAdjustPadding, onCaptureActionChange, overlayContainer, tooltip };
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
  it('uses the compact frame toolbar and groups symmetric padding controls between dividers', () => {
    const { onAdjustPadding, tooltip } = createToolbar();

    expect(tooltip.root.dataset['variant']).toBe('frame-edit');
    expect(tooltip.root.style.width).toBe('max-content');
    expect(tooltip.root.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);

    tooltip.root.querySelector<HTMLButtonElement>('.sniptale-selection-padding-decrease')?.click();
    tooltip.root.querySelector<HTMLButtonElement>('.sniptale-selection-padding-increase')?.click();

    expect(onAdjustPadding.mock.calls).toEqual([['decrease'], ['increase']]);
  });

  it('disables the full shrink step when either dimension would cross the minimum', () => {
    const { tooltip } = createToolbar({ x: 20, y: 20, width: 19, height: 80 });

    expect(
      tooltip.root.querySelector<HTMLButtonElement>('.sniptale-selection-padding-decrease')
        ?.disabled
    ).toBe(true);
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
    expect(tooltip.root.style.minWidth).toBe('0');
    expect(position.x + 420).toBeLessThanOrEqual(1268);
  });

  it('lets menu items pass the real document-capture guard and update the split action', () => {
    const { onCaptureActionChange, overlayContainer, tooltip } = createToolbar();
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
    expect(menu?.querySelector('[data-ui$=".scenario"]')).toBeNull();
    menu
      ?.querySelector<HTMLButtonElement>('[data-ui$=".copy"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.removeEventListener('click', captureGuard, true);

    expect(onCaptureActionChange).toHaveBeenCalledWith('copy');
    expect(menu?.isConnected).toBe(false);
    expect(tooltip.confirmButton.dataset['captureAction']).toBe('copy');
    expect(tooltip.confirmButton.getAttribute('aria-label')).toBe('Copy');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('owns initial focus, outside dismissal, and focus restoration', () => {
    const { overlayContainer, tooltip } = createToolbar();
    const trigger = tooltip.root.querySelector<HTMLButtonElement>(
      '.sniptale-selection-capture-menu-trigger'
    );
    trigger?.click();

    const firstItem = overlayContainer.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
    expect(document.activeElement).toBe(firstItem);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(overlayContainer.querySelector('.sniptale-selection-capture-menu')).toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.click();
    expect(closeSelectionCaptureActionMenu(overlayContainer, true)).toBe(true);
    expect(document.activeElement).toBe(trigger);
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
    const items = Array.from(
      menu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
    );

    expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    expect(document.activeElement).toBe(items[1]);
    items[1]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    expect(document.activeElement).toBe(items[2]);
    items[2]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    expect(document.activeElement).toBe(items[0]);
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    expect(document.activeElement).toBe(items[2]);

    const tabEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    items[2]?.dispatchEvent(tabEvent);
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
    expect(menu?.style.left).toBe('992px');

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    window.dispatchEvent(new Event('resize'));
    expect(menu?.style.left).toBe('212px');
    expect(anchorRectSpy).toHaveBeenCalledTimes(2);

    trigger.click();
    window.dispatchEvent(new Event('resize'));
    expect(anchorRectSpy).toHaveBeenCalledTimes(2);
  });
});
