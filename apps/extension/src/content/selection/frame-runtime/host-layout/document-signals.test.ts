// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSignalRegistry } from './document-signals';

class ObserverDouble {
  static instances: ObserverDouble[] = [];

  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();

  constructor(private readonly callback: (entries: Array<{ target: Element }>) => void) {
    ObserverDouble.instances.push(this);
  }

  emit(target: Element) {
    this.callback([{ target }]);
  }
}

afterEach(() => {
  document.body.replaceChildren();
  ObserverDouble.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('host document signals', () => {
  it('coalesces document lifecycle sources and fully releases registered resources', async () => {
    vi.stubGlobal('ResizeObserver', ObserverDouble);
    vi.stubGlobal('IntersectionObserver', ObserverDouble);
    const callbacks = {
      beginExplicitMotion: vi.fn(),
      beginTransientMotion: vi.fn(),
      continueExplicitMotion: vi.fn(),
      documentWillUnload: vi.fn(),
      endExplicitMotion: vi.fn(),
      invalidate: vi.fn(),
      registerAddedNode: vi.fn(),
      unregisterRemovedNode: vi.fn(),
    };
    const signals = createDocumentSignalRegistry(callbacks);
    signals.registerDocument(document);
    signals.registerDocument(document);

    const target = document.createElement('button');
    document.body.appendChild(target);
    signals.observe(target);
    expect(ObserverDouble.instances).toHaveLength(2);
    expect(
      ObserverDouble.instances.every((observer) => observer.observe.mock.calls.length === 1)
    ).toBe(true);
    const [resizeObserver, intersectionObserver] = ObserverDouble.instances;
    resizeObserver!.emit(target);
    expect(callbacks.beginTransientMotion).toHaveBeenCalledWith(target);
    expect(callbacks.invalidate).toHaveBeenCalledWith({ motion: true });

    callbacks.beginTransientMotion.mockClear();
    callbacks.invalidate.mockClear();
    intersectionObserver!.emit(target);
    expect(callbacks.beginTransientMotion).not.toHaveBeenCalled();
    expect(callbacks.invalidate.mock.calls).toEqual([[]]);

    target.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    target.dispatchEvent(new Event('transitionend', { bubbles: true }));
    expect(callbacks.beginExplicitMotion).toHaveBeenCalledWith(
      expect.objectContaining({ family: 'transition', target })
    );
    expect(callbacks.endExplicitMotion).toHaveBeenCalledWith(
      expect.objectContaining({ family: 'transition', target })
    );

    target.style.transform = 'translateX(20px)';
    const subtree = document.createElement('div');
    subtree.appendChild(document.createElement('iframe'));
    document.body.appendChild(subtree);
    await vi.waitFor(() => {
      expect(callbacks.beginTransientMotion).toHaveBeenCalledWith(target);
      expect(callbacks.registerAddedNode).toHaveBeenCalledWith(subtree);
    });

    subtree.remove();
    await vi.waitFor(() => expect(callbacks.unregisterRemovedNode).toHaveBeenCalledWith(subtree));

    const invalidationsBeforeScroll = callbacks.invalidate.mock.calls.length;
    window.dispatchEvent(new Event('scroll'));
    expect(callbacks.invalidate.mock.calls.length).toBeGreaterThan(invalidationsBeforeScroll);
    expect(callbacks.invalidate).toHaveBeenLastCalledWith({ viewportScroll: true });
    window.dispatchEvent(new Event('pagehide'));
    expect(callbacks.documentWillUnload).toHaveBeenCalledWith(document);

    signals.unobserve(target);
    expect(
      ObserverDouble.instances.every((observer) => observer.unobserve.mock.calls.length === 1)
    ).toBe(true);
    signals.dispose();
    expect(
      ObserverDouble.instances.every((observer) => observer.disconnect.mock.calls.length === 1)
    ).toBe(true);

    const invalidationsAfterDispose = callbacks.invalidate.mock.calls.length;
    window.dispatchEvent(new Event('scroll'));
    target.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    expect(callbacks.invalidate).toHaveBeenCalledTimes(invalidationsAfterDispose);
  });
});
