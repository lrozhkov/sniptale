import { browserRuntime, runtimeInfo } from '@sniptale/platform/browser/runtime';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { parseRuntimeRequestMessage } from '../../../contracts/messaging/parsers/boundary';
import { settingsRuntimeMessagingTransport } from '../messaging';
import type { RecordingMediaAccessKind } from './session';

const ACCESS_FAILURE = 'Recording media access is unavailable.';

/** Reads the authoritative recording projection without acquiring control capability. */
export async function readRecordingMediaAccessState(): Promise<VideoRecordingRuntimeState> {
  const response = await settingsRuntimeMessagingTransport.sendRuntimeMessage({
    type: VideoMessageType.GET_RECORDING_STATE,
  });
  if (response?.success !== true || !response.state) throw new Error(ACCESS_FAILURE);
  return response.state;
}

function isBackgroundWorker(sender: chrome.runtime.MessageSender): boolean {
  const extensionUrl = new URL(runtimeInfo.getURL(''));
  const background = runtimeInfo.getManifest().background;
  const worker =
    background && 'service_worker' in background ? background.service_worker : undefined;
  return (
    typeof worker === 'string' &&
    sender.id === extensionUrl.hostname &&
    sender.tab === undefined &&
    sender.documentId === undefined &&
    sender.url === runtimeInfo.getURL(worker) &&
    (sender.origin === undefined ||
      sender.origin === `${extensionUrl.protocol}//${extensionUrl.host}`)
  );
}

/** Subscribes only to validated state emitted by the browser-owned background worker. */
export function subscribeRecordingMediaAccessState(
  listener: (state: VideoRecordingRuntimeState) => void
): () => void {
  return browserRuntime.subscribeToMessages((message: unknown, sender) => {
    if (!isBackgroundWorker(sender)) return;
    try {
      const parsed = parseRuntimeRequestMessage(message);
      if (parsed.type === VideoMessageType.RECORDING_STATE_SYNC) listener(parsed.state);
    } catch {
      return;
    }
  });
}

function deviceConstraints(
  kind: RecordingMediaAccessKind,
  deviceId: string | null
): MediaStreamConstraints {
  const selected = deviceId === null ? true : { deviceId: { exact: deviceId } };
  return kind === 'microphone'
    ? { audio: selected, video: false }
    : { audio: false, video: selected };
}

function retainGrantedDevice(
  kind: RecordingMediaAccessKind,
  deviceId: string | null,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stream: MediaStream | null = null;
    let permission: PermissionStatus | null = null;

    const onEnded = () => finish(new Error(ACCESS_FAILURE));
    const onPermissionChange = () => {
      if (permission?.state !== 'granted') finish(new Error(ACCESS_FAILURE));
    };
    const onAbort = () => finish();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      permission?.removeEventListener('change', onPermissionChange);
      stream?.getTracks().forEach((track) => {
        track.removeEventListener('ended', onEnded);
        track.stop();
      });
      if (error) reject(error);
      else resolve();
    };

    signal.addEventListener('abort', onAbort);
    if (signal.aborted) {
      finish();
      return;
    }

    const acquire = async () => {
      const observed = await navigator.permissions.query({ name: kind as PermissionName });
      if (settled) return;
      permission = observed;
      permission.addEventListener('change', onPermissionChange);
      if (permission.state !== 'granted') {
        finish(new Error(ACCESS_FAILURE));
        return;
      }
      const acquired = await navigator.mediaDevices.getUserMedia(deviceConstraints(kind, deviceId));
      acquired.getTracks().forEach((track) => {
        track.enabled = false;
      });
      if (settled) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      stream.getTracks().forEach((track) => track.addEventListener('ended', onEnded));
      if (
        permission.state !== 'granted' ||
        stream.getTracks().length === 0 ||
        stream.getTracks().some((track) => track.readyState === 'ended')
      ) {
        finish(new Error(ACCESS_FAILURE));
      }
    };
    void acquire().catch(() => finish(new Error(ACCESS_FAILURE)));
  });
}

/** Retains disabled native tracks for one active recording until cancellation or native loss. */
export async function retainRecordingMediaDevice(
  kind: RecordingMediaAccessKind,
  deviceId: string | null,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;
  try {
    await navigator.locks.request(`sniptale:recording-media-access:${kind}`, { signal }, () =>
      retainGrantedDevice(kind, deviceId, signal)
    );
  } catch {
    if (!signal.aborted) throw new Error(ACCESS_FAILURE);
  }
}
