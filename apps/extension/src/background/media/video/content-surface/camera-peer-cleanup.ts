// policyStateId: video-recording-surface-lease - durable retry ledger for camera peer cleanup.
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';

const STORAGE_KEY = 'video-recording-camera-peer-cleanup';

let pendingPeerIds: Set<string> | null = null;
let mutationTail: Promise<void> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationTail.then(operation, operation);
  mutationTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function hydrate(): Promise<Set<string>> {
  if (pendingPeerIds) return pendingPeerIds;
  if (!browserStorage.session.isAvailable()) {
    pendingPeerIds = new Set();
    return pendingPeerIds;
  }
  const payload = await browserStorage.session.get([STORAGE_KEY]);
  const value = payload[STORAGE_KEY];
  pendingPeerIds = new Set(
    Array.isArray(value)
      ? value.filter((peerId): peerId is string => typeof peerId === 'string')
      : []
  );
  return pendingPeerIds;
}

async function persist(next: Set<string>): Promise<void> {
  if (!browserStorage.session.isAvailable()) return;
  if (next.size === 0) {
    await browserStorage.session.remove(STORAGE_KEY);
    return;
  }
  await browserStorage.session.set({ [STORAGE_KEY]: [...next] });
}

export function retainVideoRecordingCameraPeerCleanup(peerId: string): Promise<void> {
  return serialize(async () => {
    const current = await hydrate();
    if (current.has(peerId)) return;
    const next = new Set(current).add(peerId);
    await persist(next);
    pendingPeerIds = next;
  });
}

export function completeVideoRecordingCameraPeerCleanup(peerId: string): Promise<void> {
  return serialize(async () => {
    const current = await hydrate();
    if (!current.has(peerId)) return;
    const next = new Set(current);
    next.delete(peerId);
    await persist(next);
    pendingPeerIds = next;
  });
}

export function listPendingVideoRecordingCameraPeerCleanup(): Promise<string[]> {
  return serialize(async () => [...(await hydrate())]);
}

export function resetVideoRecordingCameraPeerCleanupForTests(): void {
  pendingPeerIds = null;
  mutationTail = Promise.resolve();
}
