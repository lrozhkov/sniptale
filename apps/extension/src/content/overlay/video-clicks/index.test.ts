// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoClicksController, disableVideoClicks, enableVideoClicks } from '.';
import { initializeContentUiRoots } from '../../platform/dom-host';

function appendOverlayNode<T extends Node>(node: T): T {
  document.body.appendChild(node);
  return node;
}

function resetVideoClicksDom(): void {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.replaceChildren();
  document.body.replaceChildren();
}

describe('video clicks controller lifecycle', () => {
  beforeEach(() => {
    resetVideoClicksDom();
  });

  it('enables and disables click listeners through explicit controller ownership', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const controller = createVideoClicksController({
      appendOverlayNode,
      targetHead: document.head,
    });

    controller.enable();

    expect(controller.isEnabled()).toBe(true);
    expect(addListener).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });

    controller.disable();

    expect(controller.isEnabled()).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function), {
      capture: true,
    });
  });
});

describe('video clicks controller ripple behavior', () => {
  beforeEach(() => {
    resetVideoClicksDom();
  });

  it('excludes registered content chrome while preserving page clicks and event propagation', () => {
    const showRipple = vi.fn();
    const controller = createVideoClicksController({ createDomDriver: () => ({ showRipple }) });
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const { appContainer, overlayRoot } = initializeContentUiRoots(shadow);
    controller.enable();
    try {
      for (const container of [appContainer, overlayRoot]) {
        const button = document.createElement('button');
        container.append(button);
        const observer = vi.fn();
        button.addEventListener('click', observer);
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        expect(showRipple).not.toHaveBeenCalled();
        expect(observer).toHaveBeenCalledOnce();
      }
      document.body.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 24 })
      );
      expect(showRipple).toHaveBeenCalledExactlyOnceWith(12, 24);
    } finally {
      controller.disable();
    }
  });

  it('creates a ripple element on click and removes it after the animation timeout', () => {
    vi.useFakeTimers();
    const controller = createVideoClicksController({
      appendOverlayNode,
      targetHead: document.head,
    });

    controller.enable();
    document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 30, clientY: 40 }));

    expect(document.querySelector('div')).not.toBeNull();
    expect(document.getElementById('video-ripple-styles')).not.toBeNull();

    vi.runAllTimers();
    expect(document.querySelector('div')).toBeNull();

    controller.disable();
  });

  it('ignores clicks before enable and repeated enable-disable calls', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const controller = createVideoClicksController({
      appendOverlayNode,
      targetHead: document.head,
    });

    document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }));
    expect(document.querySelector('div')).toBeNull();

    controller.enable();
    controller.enable();
    controller.disable();
    controller.disable();

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});

describe('video clicks legacy singleton facade', () => {
  beforeEach(() => {
    resetVideoClicksDom();
  });

  it('enables and disables the lazily created singleton owner without throwing', () => {
    expect(() => {
      enableVideoClicks();
      disableVideoClicks();
    }).not.toThrow();
  });
});
