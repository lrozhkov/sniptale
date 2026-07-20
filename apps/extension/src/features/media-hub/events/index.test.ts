/* eslint-disable max-lines-per-function --
   exact media-hub event proof keeps publish/subscription payload permutations in one owner-local suite */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MediaHubEventListener = (event: MessageEvent<unknown>) => void;

class FakeBroadcastChannel {
  static failPostCount = 0;
  static shouldThrow = false;
  static instances: FakeBroadcastChannel[] = [];

  closed = false;
  listeners = new Set<MediaHubEventListener>();
  postedMessages: unknown[] = [];

  constructor(public readonly name: string) {
    if (FakeBroadcastChannel.shouldThrow) {
      throw new Error('channel-unavailable');
    }

    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    if (FakeBroadcastChannel.failPostCount > 0) {
      FakeBroadcastChannel.failPostCount -= 1;
      throw new Error('post failed');
    }

    this.postedMessages.push(message);
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
    FakeBroadcastChannel.failPostCount = 0;
    FakeBroadcastChannel.instances = [];
    FakeBroadcastChannel.shouldThrow = false;
  }
}

beforeEach(() => {
  vi.resetModules();
  FakeBroadcastChannel.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media-hub-events publish channel flow', () => {
  it('reuses one publish channel for library and storage events when available', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T05:30:00.000Z'));
    const { publishMediaHubLibraryChanged, publishMediaHubStorageAlert } = await import('./index');

    publishMediaHubLibraryChanged('import', ['asset-1']);
    publishMediaHubStorageAlert('save', 'Quota exceeded');

    expect(FakeBroadcastChannel.instances).toHaveLength(1);
    expect(FakeBroadcastChannel.instances[0]?.name).toBe('sniptale-media-hub');
    expect(FakeBroadcastChannel.instances[0]?.postedMessages).toEqual([
      {
        assetIds: ['asset-1'],
        reason: 'import',
        timestamp: Date.now(),
        type: 'library-changed',
      },
      {
        message: 'Quota exceeded',
        operation: 'save',
        timestamp: Date.now(),
        type: 'storage-alert',
      },
    ]);
    expect(FakeBroadcastChannel.instances[0]?.closed).toBe(false);
    vi.useRealTimers();
  });
});

describe('media-hub-events publish fallback flow', () => {
  it('gracefully handles missing or failing broadcast channel support', async () => {
    const { publishMediaHubLibraryChanged, subscribeToMediaHubEvents } = await import('./index');

    const noopUnsubscribe = subscribeToMediaHubEvents(vi.fn());
    publishMediaHubLibraryChanged('sync', ['asset-2']);
    noopUnsubscribe();
    expect(FakeBroadcastChannel.instances).toHaveLength(0);

    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    FakeBroadcastChannel.shouldThrow = true;
    publishMediaHubLibraryChanged('update', ['asset-3']);
    expect(FakeBroadcastChannel.instances).toHaveLength(0);
  });

  it('recreates the publish channel after a post failure', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    FakeBroadcastChannel.failPostCount = 1;
    const { publishMediaHubLibraryChanged } = await import('./index');

    publishMediaHubLibraryChanged('sync', ['asset-4']);

    expect(FakeBroadcastChannel.instances).toHaveLength(2);
    expect(FakeBroadcastChannel.instances[0]?.closed).toBe(true);
    expect(FakeBroadcastChannel.instances[1]?.postedMessages).toEqual([
      {
        assetIds: ['asset-4'],
        reason: 'sync',
        timestamp: expect.any(Number),
        type: 'library-changed',
      },
    ]);
  });

  it('keeps publish fail-soft when the recreated channel also throws', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    FakeBroadcastChannel.failPostCount = 2;
    const { publishMediaHubLibraryChanged } = await import('./index');

    expect(() => publishMediaHubLibraryChanged('sync', ['asset-4'])).not.toThrow();
    expect(FakeBroadcastChannel.instances).toHaveLength(2);
    expect(FakeBroadcastChannel.instances[1]?.postedMessages).toEqual([]);
  });
});

describe('media-hub-events subscription flow', () => {
  it('subscribes to channel messages and ignores malformed media hub events', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const listener = vi.fn();
    const { subscribeToMediaHubEvents } = await import('./index');

    const unsubscribe = subscribeToMediaHubEvents(listener);
    const channel = FakeBroadcastChannel.instances[0];
    channel?.emit({
      assetIds: ['asset-5'],
      reason: 'create',
      timestamp: 2,
      type: 'library-changed',
    });

    expect(listener).toHaveBeenCalledWith({
      assetIds: ['asset-5'],
      reason: 'create',
      timestamp: 2,
      type: 'library-changed',
    });

    channel?.emit(null);
    expect(listener).toHaveBeenCalledTimes(1);

    channel?.emit({
      assetIds: ['asset-6'],
      reason: 'create',
      timestamp: 'invalid',
      type: 'library-changed',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(channel?.closed).toBe(true);
    expect(channel?.listeners.size).toBe(0);
  });

  it('accepts storage-alert payloads and ignores malformed storage notifications', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const listener = vi.fn();
    const { subscribeToMediaHubEvents } = await import('./index');

    const unsubscribe = subscribeToMediaHubEvents(listener);
    const channel = FakeBroadcastChannel.instances[0];

    channel?.emit({
      message: 'Quota warning',
      operation: 'save',
      timestamp: 3,
      type: 'storage-alert',
    });
    channel?.emit({
      message: 9,
      operation: 'save',
      timestamp: 4,
      type: 'storage-alert',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      message: 'Quota warning',
      operation: 'save',
      timestamp: 3,
      type: 'storage-alert',
    });

    unsubscribe();
  });
});
