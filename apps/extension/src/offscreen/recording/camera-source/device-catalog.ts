// policyStateIds: [] - supported device kinds are an immutable browser-media allowlist, not authority state.
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';

const RECORDING_DEVICE_KINDS = new Set<MediaDeviceKind>(['audioinput', 'videoinput']);

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

async function hydrateDeviceLabels(kind: 'audioinput' | 'videoinput'): Promise<void> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === 'audioinput',
      video: kind === 'videoinput',
    });
  } catch {
    // Enumeration still returns stable device ids when the user declines this source.
  } finally {
    if (stream) stopStream(stream);
  }
}

function needsLabelHydration(devices: MediaDeviceInfo[], kind: MediaDeviceKind): boolean {
  const matching = devices.filter((device) => device.kind === kind);
  return matching.length === 0 || matching.some((device) => device.label.length === 0);
}

export async function listVideoRecordingMediaDevices(
  requestedKind?: 'audioinput' | 'videoinput'
): Promise<VideoRecordingMediaDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const initial = await navigator.mediaDevices.enumerateDevices();
  const requestedKinds = requestedKind ? [requestedKind] : (['audioinput', 'videoinput'] as const);
  const kinds = requestedKinds.filter((kind) => needsLabelHydration(initial, kind));
  await Promise.all(kinds.map(hydrateDeviceLabels));
  const devices = kinds.length > 0 ? await navigator.mediaDevices.enumerateDevices() : initial;
  return devices.flatMap((device) => {
    if (
      !RECORDING_DEVICE_KINDS.has(device.kind) ||
      (requestedKind && device.kind !== requestedKind)
    ) {
      return [];
    }
    const kind = device.kind as 'audioinput' | 'videoinput';
    return {
      deviceId: device.deviceId,
      kind,
      label: device.label,
    };
  });
}
