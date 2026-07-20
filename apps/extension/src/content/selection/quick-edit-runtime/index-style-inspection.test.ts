// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickEditRuntimeController } from '.';
import { setQuickEditStyleInspectorModeEnabled } from './page-style-inspection';

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function createImageElement(): HTMLElement {
  const element = document.createElement('img');
  document.body.append(element);
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 112,
      height: 80,
      left: 24,
      right: 144,
      toJSON: () => ({}),
      top: 32,
      width: 120,
      x: 24,
      y: 32,
    }),
  });

  return element;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  setQuickEditStyleInspectorModeEnabled(false);
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('quick-edit runtime style-inspection routing', () => {
  it('frames image targets without starting text editing', () => {
    const controller = createQuickEditRuntimeController({
      onDisableRequested: vi.fn(),
    });
    const element = createImageElement();

    controller.mode.enable();
    setQuickEditStyleInspectorModeEnabled(true);
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));

    const hoverOverlay = document.querySelector<HTMLElement>('.sniptale-quick-edit-hover');
    expect(hoverOverlay?.style.display).toBe('block');

    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(element.classList.contains('sniptale-editing')).toBe(false);
    expect(controller.editing.getEditingElements().size).toBe(0);
    controller.mode.disable();
  });
});
