// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addContentFrameDetailListener,
  addContentFrameSignalListener,
  dispatchContentFrameEvent,
  dispatchContentFrameSignal,
} from './dispatch';

describe('frame-events.dispatch detail events', () => {
  it('dispatches detail events to a custom target and removes the listener on cleanup', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = addContentFrameDetailListener<{ value: number }>(
      'sniptale-test-detail',
      listener,
      target
    );

    dispatchContentFrameEvent('sniptale-test-detail', { value: 3 }, target);
    cleanup();
    dispatchContentFrameEvent('sniptale-test-detail', { value: 7 }, target);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 3 });
  });

  it('ignores plain events and CustomEvent payloads without detail', () => {
    const listener = vi.fn();
    const cleanup = addContentFrameDetailListener<{ value: number }>(
      'sniptale-test-detail',
      listener
    );

    window.dispatchEvent(new Event('sniptale-test-detail'));
    window.dispatchEvent(new CustomEvent('sniptale-test-detail'));

    expect(listener).not.toHaveBeenCalled();
    cleanup();
  });
});

describe('frame-events.dispatch signal events', () => {
  it('dispatches signal events to a custom target and unregisters the signal listener', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = addContentFrameSignalListener('sniptale-test-signal', listener, target);

    dispatchContentFrameSignal('sniptale-test-signal', target);
    cleanup();
    dispatchContentFrameSignal('sniptale-test-signal', target);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports detail listeners on the window target after signal listeners are removed', () => {
    const detailListener = vi.fn();
    const cleanup = addContentFrameDetailListener<{ ok: boolean }>(
      'sniptale-test-follow-up',
      detailListener
    );

    dispatchContentFrameEvent('sniptale-test-follow-up', { ok: true });

    expect(detailListener).toHaveBeenCalledWith({ ok: true });
    cleanup();
  });
});
