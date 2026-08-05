// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalloutSettingsPopover } from '.';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let anchorEl: HTMLButtonElement | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  anchorEl = document.createElement('button');
  anchorEl.getBoundingClientRect = () =>
    ({
      bottom: 80,
      height: 40,
      left: 40,
      right: 120,
      top: 40,
      width: 80,
      x: 40,
      y: 40,
    }) as DOMRect;
  container = document.createElement('div');
  document.body.append(container, anchorEl);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  anchorEl?.remove();
  container = null;
  anchorEl = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CalloutSettingsPopover', () => {
  it('drags by its title and closes through the explicit close button', () => {
    const onClose = vi.fn();
    act(() => {
      root?.render(
        <CalloutSettingsPopover
          anchorEl={anchorEl}
          frameId="frame-1"
          frameRect={{ x: 100, y: 100, width: 180, height: 100 }}
          isOpen
          onClose={onClose}
        />
      );
    });
    const popover = document.querySelector<HTMLElement>(
      '[data-ui="content.callout-settings.popover"]'
    )!;
    const header = popover.querySelector<HTMLElement>('.sniptale-settings-popover-header')!;
    header.setPointerCapture = vi.fn();
    header.releasePointerCapture = vi.fn();
    const initialLeft = Number.parseFloat(popover.style.left);
    const initialTop = Number.parseFloat(popover.style.top);

    act(() => {
      header.dispatchEvent(
        new TestPointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
          pointerId: 4,
        })
      );
      header.dispatchEvent(
        new TestPointerEvent('pointermove', {
          bubbles: true,
          clientX: 70,
          clientY: 60,
          pointerId: 4,
        })
      );
      header.dispatchEvent(new TestPointerEvent('pointerup', { bubbles: true, pointerId: 4 }));
    });

    expect(Number.parseFloat(popover.style.left)).toBe(initialLeft + 50);
    expect(Number.parseFloat(popover.style.top)).toBe(initialTop + 40);
    const close = popover.querySelector<HTMLButtonElement>('.sniptale-settings-popover-close');
    act(() => close?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays open on outside pointer interaction as a modeless inspector', () => {
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <CalloutSettingsPopover
          anchorEl={anchorEl}
          frameId="frame-1"
          frameRect={{ x: 100, y: 100, width: 180, height: 100 }}
          isOpen
          onClose={onClose}
        />
      );
    });

    const popover = document.querySelector('[data-ui="content.callout-settings.popover"]');
    expect(popover).not.toBeNull();
    expect(popover?.classList.contains('sniptale-content-popover--compact')).toBe(true);
    expect(popover?.classList.contains('sniptale-content-popover--toolbar-menu')).toBe(true);
    expect(popover?.classList.contains('sniptale-content-popover--scroll')).toBe(true);
    expect((popover as HTMLElement | null)?.style.width).toBe('400px');

    act(() => {
      vi.advanceTimersByTime(150);
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui="content.callout-settings.popover"]')).not.toBeNull();
  });

  it('keeps comment settings open while applying a color from the floating picker', () => {
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <CalloutSettingsPopover
          anchorEl={anchorEl}
          frameId="frame-1"
          frameRect={{ x: 100, y: 100, width: 180, height: 100 }}
          isOpen
          onClose={onClose}
        />
      );
    });

    expect(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === 'Выбрать шаблон'
      )
    ).toBe(true);

    const pickerTrigger = document.querySelector<HTMLButtonElement>(
      '[data-ui="shared.ui.color-selector.picker-trigger"]'
    );
    expect(pickerTrigger).not.toBeNull();

    act(() => {
      pickerTrigger?.click();
    });

    expect(document.querySelector('[data-ui="shared.ui.color-selector.picker"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 1000, clientY: 1000 })
      );
    });

    const applyButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Применить'
    );
    expect(applyButton).toBeDefined();

    act(() => {
      (applyButton as HTMLButtonElement).click();
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 1000, clientY: 1000 })
      );
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui="content.callout-settings.popover"]')).not.toBeNull();
  });

  it('keeps comment settings open while selecting a dropdown option', () => {
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <CalloutSettingsPopover
          anchorEl={anchorEl}
          frameId="frame-1"
          frameRect={{ x: 100, y: 100, width: 180, height: 100 }}
          isOpen
          onClose={onClose}
        />
      );
    });

    expect(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === 'Выбрать шаблон'
      )
    ).toBe(true);

    const fontSelect = document.querySelector<HTMLButtonElement>('[aria-label="Шрифт"]');
    expect(fontSelect).not.toBeNull();
    act(() => fontSelect?.click());

    const serifOption = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('Serif')
    );
    expect(serifOption).toBeDefined();
    act(() => {
      serifOption?.click();
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 1000, clientY: 1000 })
      );
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui="content.callout-settings.popover"]')).not.toBeNull();
  });
});
