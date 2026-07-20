import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';

const MEDIA_HUB_CHANNEL_NAME = 'sniptale-media-hub';

type MediaHubLibraryChangeReason = 'create' | 'update' | 'delete' | 'import' | 'cleanup' | 'sync';

interface MediaHubLibraryChangedEvent {
  type: 'library-changed';
  reason: MediaHubLibraryChangeReason;
  assetIds: string[];
  timestamp: number;
}

interface MediaHubStorageAlertEvent {
  type: 'storage-alert';
  operation: string;
  message: string;
  timestamp: number;
}

type MediaHubEvent = MediaHubLibraryChangedEvent | MediaHubStorageAlertEvent;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMediaHubEvent(value: unknown): value is MediaHubEvent {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value['timestamp'] !== 'number' || !Number.isFinite(value['timestamp'])) {
    return false;
  }

  if (value['type'] === 'library-changed') {
    return (
      (value['reason'] === 'create' ||
        value['reason'] === 'update' ||
        value['reason'] === 'delete' ||
        value['reason'] === 'import' ||
        value['reason'] === 'cleanup' ||
        value['reason'] === 'sync') &&
      isStringArray(value['assetIds'])
    );
  }

  if (value['type'] === 'storage-alert') {
    return typeof value['operation'] === 'string' && typeof value['message'] === 'string';
  }

  return false;
}

function createMediaHubChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  try {
    return new BroadcastChannel(MEDIA_HUB_CHANNEL_NAME);
  } catch {
    return null;
  }
}

function createMediaHubPublisher() {
  let publishChannel: BroadcastChannel | null = null;

  const getPublishChannel = (): BroadcastChannel | null => {
    if (publishChannel) {
      return publishChannel;
    }

    publishChannel = createMediaHubChannel();
    return publishChannel;
  };

  const resetPublishChannel = () => {
    if (!publishChannel) {
      return;
    }

    publishChannel.close();
    publishChannel = null;
  };

  return {
    publish(event: MediaHubEvent) {
      const channel = getPublishChannel();
      if (!channel) {
        return;
      }

      try {
        channel.postMessage(event);
      } catch {
        resetPublishChannel();
        try {
          getPublishChannel()?.postMessage(event);
        } catch {
          resetPublishChannel();
        }
      }
    },
  };
}

const defaultMediaHubPublisher = createLazyDefaultOwner(createMediaHubPublisher);

export function publishMediaHubLibraryChanged(
  reason: MediaHubLibraryChangeReason,
  assetIds: string[]
): void {
  defaultMediaHubPublisher.getOwner().publish({
    type: 'library-changed',
    reason,
    assetIds,
    timestamp: Date.now(),
  });
}

export function publishMediaHubStorageAlert(operation: string, message: string): void {
  defaultMediaHubPublisher.getOwner().publish({
    type: 'storage-alert',
    operation,
    message,
    timestamp: Date.now(),
  });
}

export function subscribeToMediaHubEvents(listener: (event: MediaHubEvent) => void): () => void {
  const channel = createMediaHubChannel();
  if (!channel) {
    return () => {};
  }

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (isMediaHubEvent(event.data)) {
      listener(event.data);
    }
  };

  channel.addEventListener('message', handleMessage);

  return () => {
    channel.removeEventListener('message', handleMessage);
    channel.close();
  };
}
