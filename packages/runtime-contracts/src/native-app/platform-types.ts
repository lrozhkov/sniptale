import type { NativeAudioSourceMode } from '../video/types/types';

export type NativePlatformKind = 'windows' | 'macos' | 'linux';
export type NativeCaptureMode = 'screen' | 'active-window' | 'all-screens' | 'region';
export type NativeRecordingMode = Exclude<NativeCaptureMode, 'all-screens'>;
export type NativeAudioSource = NativeAudioSourceMode;

export interface NativePlatform {
  kind: NativePlatformKind;
  version: string;
  arch: 'x64' | 'arm64';
  displayServer?: 'win32' | 'quartz' | 'wayland' | 'x11' | 'unknown';
  packageKind?: 'wix-msi' | 'pkg' | 'dmg' | 'deb' | 'rpm' | 'appimage' | 'tar' | 'unknown';
}

export interface NativeAutostartState {
  supported: boolean;
  enabled: boolean;
  method:
    | 'windows-hkcu-run'
    | 'macos-launch-agent'
    | 'linux-systemd-user'
    | 'linux-xdg-autostart'
    | 'none'
    | 'unknown';
}

export interface NativeInstallState {
  platform: NativePlatform;
  appVersion: string;
  appCacheSchemaVersion: number;
  installerVersion: string;
  nativeHostManifestVersion: string;
  updateChannel: 'stable' | 'beta' | 'dev';
  signedBinary: boolean;
  rollbackProtected: boolean;
  autostart: NativeAutostartState;
  notarized?: boolean;
  packageIntegrity: 'valid' | 'invalid' | 'unknown' | 'unsupported';
}

export type NativeCapabilityUnavailableReason =
  | 'os-too-old'
  | 'encoder-missing'
  | 'device-busy'
  | 'permission-denied'
  | 'policy-denied'
  | 'unsupported-browser'
  | 'unsupported-profile'
  | 'unsupported-platform'
  | 'unsupported-display-server'
  | 'platform-permission-required'
  | 'notarization-invalid'
  | 'protected-content'
  | 'unknown';

export interface NativeMicrophoneDevice {
  id: string;
  label: string;
  isDefault: boolean;
  available: boolean;
}

export interface NativeAppCapabilities {
  capture: {
    screenshotModes: NativeCaptureMode[];
    videoModes: NativeRecordingMode[];
    supportsFreezeRegionSelection: boolean;
  };
  codecs: {
    containers: Array<'mp4'>;
    video: Array<'h264'>;
    audio: Array<'aac'>;
    hardwareEncoderAvailable: boolean;
    unavailableReasons: NativeCapabilityUnavailableReason[];
  };
  audio: {
    microphoneDevices: NativeMicrophoneDevice[];
    supportsMicrophone: boolean;
    supportsSystemAudio: boolean;
    supportsMixedAudio: boolean;
    unavailableReasons: NativeCapabilityUnavailableReason[];
  };
  limits: {
    maxChunkBytes: number;
    maxRecordingBytes: number;
    maxScreenshotBytes: number;
    maxFps: number;
    maxWidth: number;
    maxHeight: number;
  };
}
