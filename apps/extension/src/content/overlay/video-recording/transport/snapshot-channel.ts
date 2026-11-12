// policyStateId: video-recording-surface-lease
// Caches the latest authorized surface projection for late React subscribers.
import type {
  VideoRecordingSurfaceSnapshotMessage,
  VideoRecordingSurfaceSnapshot,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';

type SurfaceSnapshotListener = (
  snapshot: VideoRecordingSurfaceSnapshot,
  surfaceToken?: string
) => void;

const listeners = new Set<SurfaceSnapshotListener>();
const runtimeStateListeners = new Set<(state: VideoRecordingRuntimeState) => void>();
let latestMessage: { snapshot: VideoRecordingSurfaceSnapshot; surfaceToken?: string } | null = null;

export function receiveVideoRecordingSurfaceSnapshot(message: {
  snapshot: VideoRecordingSurfaceSnapshot;
  surfaceToken?: string;
}): void {
  latestMessage = {
    snapshot: message.snapshot,
    ...(message.surfaceToken === undefined ? {} : { surfaceToken: message.surfaceToken }),
  };
  listeners.forEach((listener) => listener(message.snapshot, message.surfaceToken));
}

export function receiveVideoRecordingRuntimeState(state: VideoRecordingRuntimeState): void {
  runtimeStateListeners.forEach((listener) => listener(state));
}

export function subscribeToVideoRecordingRuntimeState(
  listener: (state: VideoRecordingRuntimeState) => void
): () => void {
  runtimeStateListeners.add(listener);
  return () => runtimeStateListeners.delete(listener);
}

export function subscribeToVideoRecordingSurfaceSnapshots(
  listener: SurfaceSnapshotListener
): () => void {
  listeners.add(listener);
  if (latestMessage) {
    listener(latestMessage.snapshot, latestMessage.surfaceToken);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function clearVideoRecordingSurfaceSnapshot(): void {
  latestMessage = null;
}

type CapturePreparationListener = (message: VideoRecordingSurfaceSnapshotMessage) => Promise<void>;
const capturePreparationListeners = new Set<CapturePreparationListener>();

/** Admission must wait for a mounted surface, including its paint boundary. */
export async function prepareVideoRecordingCapture(
  message: VideoRecordingSurfaceSnapshotMessage
): Promise<void> {
  if (capturePreparationListeners.size !== 1)
    throw new Error('Recording drawing surface is unavailable');
  await Promise.all([...capturePreparationListeners].map((listener) => listener(message)));
}

export function subscribeToVideoRecordingCapturePreparation(
  listener: CapturePreparationListener
): () => void {
  capturePreparationListeners.add(listener);
  return () => {
    capturePreparationListeners.delete(listener);
  };
}
