// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addContentRuntimeDetailEventListener,
  addContentRuntimeSignalEventListener,
  dispatchContentRuntimeDetailEvent,
  dispatchContentRuntimeSignalEvent,
} from './event-bus';

describe('content runtime event bus', () => {
  it('dispatches and listens for detail events with cleanup support', () => {
    const listener = vi.fn();
    const cleanup = addContentRuntimeDetailEventListener('sniptale-test-detail', listener);

    dispatchContentRuntimeDetailEvent('sniptale-test-detail', { value: 123 });

    expect(listener).toHaveBeenCalledWith({ value: 123 });

    cleanup();
    dispatchContentRuntimeDetailEvent('sniptale-test-detail', { value: 456 });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dispatches detail events to a custom target without touching window listeners', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = addContentRuntimeDetailEventListener('sniptale-test-target', listener, target);

    dispatchContentRuntimeDetailEvent('sniptale-test-target', { scoped: true }, target);

    expect(listener).toHaveBeenCalledWith({ scoped: true });
    cleanup();
  });

  it('dispatches and listens for signal events with cleanup support', () => {
    const listener = vi.fn();
    const cleanup = addContentRuntimeSignalEventListener('sniptale-test-signal', listener);

    dispatchContentRuntimeSignalEvent('sniptale-test-signal');

    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();
    dispatchContentRuntimeSignalEvent('sniptale-test-signal');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
