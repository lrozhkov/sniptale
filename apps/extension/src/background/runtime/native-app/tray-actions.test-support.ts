import type { NativeAppCapabilities } from '../../../contracts/native-app';

export function createNativeTrayActionCapabilities(
  patch: Partial<NativeAppCapabilities['capture']> = {}
): NativeAppCapabilities {
  return {
    audio: {
      microphoneDevices: [],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    capture: {
      screenshotModes: ['screen', 'active-window', 'all-screens', 'region'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen', 'active-window', 'region'],
      ...patch,
    },
    codecs: {
      audio: ['aac'],
      containers: ['mp4'],
      hardwareEncoderAvailable: true,
      unavailableReasons: [],
      video: ['h264'],
    },
    limits: {
      maxChunkBytes: 1,
      maxFps: 60,
      maxHeight: 2160,
      maxRecordingBytes: 1,
      maxScreenshotBytes: 1,
      maxWidth: 3840,
    },
  };
}
