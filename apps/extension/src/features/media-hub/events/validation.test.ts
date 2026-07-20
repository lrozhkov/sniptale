/* eslint-disable max-lines-per-function --
   validation payload proof stays grouped to keep the broadcast-channel boundary explicit */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MediaHubEventListener = (event: MessageEvent<unknown>) => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  closed = false;
  listeners = new Set<MediaHubEventListener>();

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  addEventListener(_type: 'message', listener: MediaHubEventListener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: MediaHubEventListener) {
    this.listeners.delete(listener);
  }

  emit(data: unknown) {
    for (const listener of this.listeners) {
      listener({ data } as MessageEvent<unknown>);
    }
  }

  static reset() {
    FakeBroadcastChannel.instances = [];
  }
}

beforeEach(() => {
  vi.resetModules();
  FakeBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media-hub-events validation flows', () => {
  it('accepts every supported library change reason', async () => {
    const listener = vi.fn();
    const { subscribeToMediaHubEvents } = await import('./index');

    const unsubscribe = subscribeToMediaHubEvents(listener);
    const channel = FakeBroadcastChannel.instances[0];
    for (const reason of ['update', 'delete', 'cleanup', 'sync'] as const) {
      channel?.emit({
        assetIds: ['asset-branch'],
        reason,
        timestamp: 3,
        type: 'library-changed',
      });
    }

    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
  });

  it('accepts valid storage alert events and ignores malformed payloads', async () => {
    const listener = vi.fn();
    const { subscribeToMediaHubEvents } = await import('./index');

    const unsubscribe = subscribeToMediaHubEvents(listener);
    const channel = FakeBroadcastChannel.instances[0];

    channel?.emit({
      message: 'Quota exceeded',
      operation: 'write',
      timestamp: 4,
      type: 'storage-alert',
    });
    channel?.emit({
      message: 42,
      operation: 'write',
      timestamp: 5,
      type: 'storage-alert',
    });
    channel?.emit({
      assetIds: ['asset-7', 8],
      reason: 'cleanup',
      timestamp: 6,
      type: 'library-changed',
    });
    channel?.emit({
      assetIds: ['asset-8'],
      reason: 'unexpected',
      timestamp: 7,
      type: 'library-changed',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      message: 'Quota exceeded',
      operation: 'write',
      timestamp: 4,
      type: 'storage-alert',
    });
    unsubscribe();
  });
});
