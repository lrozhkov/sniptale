export type MicrophoneAccessState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'no-device'
  | 'device-busy'
  | 'unavailable'
  | 'unknown';

export type MicrophoneInputDevice = {
  deviceId: string;
  label: string;
};

export type MicrophoneInputAcquisition = {
  release(): void;
  track: MediaStreamTrack;
};

export type MicrophoneLevelMonitor = {
  dispose(): void;
};

export class MicrophoneInputError extends Error {
  constructor(readonly state: MicrophoneAccessState) {
    super(`microphone-input:${state}`);
    this.name = 'MicrophoneInputError';
  }
}

function mapMicrophoneAccessError(error: unknown): MicrophoneAccessState {
  if (!(error instanceof DOMException)) return 'unknown';
  switch (error.name) {
    case 'NotAllowedError':
      return 'denied';
    case 'NotFoundError':
      return 'no-device';
    case 'NotReadableError':
    case 'AbortError':
      return 'device-busy';
    case 'SecurityError':
    case 'TypeError':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

export async function readMicrophoneAccessState(): Promise<MicrophoneAccessState> {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

function createAudioConstraints(deviceId: string | null): MediaStreamConstraints {
  return {
    audio: deviceId === null ? true : { deviceId: { exact: deviceId } },
  };
}

export async function requestMicrophoneAccess(
  deviceId: string | null = null
): Promise<MicrophoneAccessState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  try {
    const stream = await navigator.mediaDevices.getUserMedia(createAudioConstraints(deviceId));
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (error) {
    return mapMicrophoneAccessError(error);
  }
}

export async function listMicrophoneInputDevices(): Promise<MicrophoneInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const seen = new Set<string>();
    return devices.flatMap((device) => {
      if (device.kind !== 'audioinput' || !device.deviceId || seen.has(device.deviceId)) return [];
      seen.add(device.deviceId);
      return [{ deviceId: device.deviceId, label: device.label }];
    });
  } catch {
    return [];
  }
}

export async function acquireMicrophoneInput(
  deviceId: string | null
): Promise<MicrophoneInputAcquisition> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicrophoneInputError('unavailable');
  try {
    const stream = await navigator.mediaDevices.getUserMedia(createAudioConstraints(deviceId));
    const track = stream.getAudioTracks()[0];
    if (!track) {
      for (const streamTrack of stream.getTracks()) streamTrack.stop();
      throw new MicrophoneInputError('no-device');
    }
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        for (const streamTrack of stream.getTracks()) streamTrack.stop();
      },
      track,
    };
  } catch (error) {
    if (error instanceof MicrophoneInputError) throw error;
    throw new MicrophoneInputError(mapMicrophoneAccessError(error));
  }
}

export function subscribeToMicrophoneDeviceChanges(listener: () => void): () => void {
  if (!navigator.mediaDevices?.addEventListener) return () => undefined;
  navigator.mediaDevices.addEventListener('devicechange', listener);
  return () => navigator.mediaDevices.removeEventListener('devicechange', listener);
}

export function observeMicrophoneLevel(
  track: MediaStreamTrack,
  listener: (level: number) => void
): MicrophoneLevelMonitor {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(new MediaStream([track]));
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.55;
  const samples = new Uint8Array(analyser.fftSize);
  source.connect(analyser);
  void audioContext.resume().catch(() => undefined);
  const intervalId = globalThis.setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      energy += centered * centered;
    }
    listener(Math.min(1, Math.sqrt(energy / samples.length) * 3));
  }, 100);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      globalThis.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => undefined);
    },
  };
}

export async function subscribeToMicrophoneAccessChanges(
  listener: (state: MicrophoneAccessState) => void
): Promise<() => void> {
  if (!navigator.permissions?.query) return () => undefined;
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    const handleChange = () => listener(status.state);
    status.addEventListener('change', handleChange);
    return () => status.removeEventListener('change', handleChange);
  } catch {
    return () => undefined;
  }
}
