import type {
  MicrophoneAccessState,
  MicrophoneInputDevice,
} from '@sniptale/platform/browser/user-media';
import type {
  VoiceInputLanguage,
  VoiceProviderSelection,
  VoiceInputMode,
  VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceModelSelectionController } from './use-voice-model-selection';

export type VoiceInputSettingsError = 'install' | 'permission' | 'runtime' | null;

export type VoiceInputSettingsController = {
  actions: {
    installPackage(): Promise<void>;
    refresh(): Promise<void>;
    requestMicrophone(): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    cancel(): void;
  };
  models: VoiceModelSelectionController;
  preferences: {
    enabled?: boolean;
    backend: 'browser' | 'model';
    transcription: VoiceProviderSelection | null;
    correction: { enabled: boolean; model: VoiceProviderSelection | null };
    setBackend(backend: 'off' | 'browser' | 'model'): Promise<void>;
    setCorrectionEnabled(enabled: boolean): Promise<void>;
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
