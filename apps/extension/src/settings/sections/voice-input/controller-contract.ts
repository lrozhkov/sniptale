import type {
  MicrophoneAccessState,
  MicrophoneInputDevice,
} from '@sniptale/platform/browser/user-media';
import type {
  VoiceInputLanguage,
  VoiceInputMode,
  VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';

export type VoiceInputSettingsError = 'install' | 'permission' | 'runtime' | null;

export type VoiceInputSettingsController = {
  actions: {
    installPackage(): Promise<void>;
    refresh(): Promise<void>;
    requestMicrophone(): Promise<void>;
    start(): Promise<void>;
    stop(): void;
  };
  preferences: {
    language: VoiceInputLanguage;
    microphoneDeviceId: string | null;
    mode: VoiceInputMode;
    saving: boolean;
    setLanguage(language: VoiceInputLanguage): Promise<void>;
    setMicrophoneDeviceId(deviceId: string | null): Promise<void>;
    setMode(mode: VoiceInputMode): Promise<void>;
  };
  status: {
    audioLevel: number;
    audioPeaks: number[];
    checking: boolean;
    error: VoiceInputSettingsError;
    installing: boolean;
    microphoneAccess: MicrophoneAccessState;
    microphones: MicrophoneInputDevice[];
    microphonesLoading: boolean;
    snapshot: VoiceInputSnapshot;
  };
  transcript: {
    finalText: string;
    interimText: string;
    setFinalText(value: string): void;
  };
};
