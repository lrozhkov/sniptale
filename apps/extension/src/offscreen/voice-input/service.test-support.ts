import { vi } from 'vitest';
import type { VoiceAudioInput } from './audio-input';
import type { VoiceInputRecognitionDeps } from './recognition-run';
import type {
  SpeechRecognitionResult,
  SpeechRecognitionSessionCallbacks,
} from '@sniptale/platform/browser/speech-recognition';
import {
  MicrophoneInputError,
  type MicrophoneAccessState,
  type MicrophoneLevelFrame,
} from '@sniptale/platform/browser/user-media';
import {
  type VoiceInputServerEvent,
  type VoiceInputCaptureEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { createOffscreenVoiceInputService } from './service';

type FakeRecognition = {
  audioTrack: MediaStreamTrack;
  abort: () => void;
  callbacks: SpeechRecognitionSessionCallbacks;
  dispose: () => void;
  flavor: 'standard';
  legacyBrowserManaged: boolean;
  processLocally: boolean;
  start: () => void;
  stop: () => void;
};

export function createHarness(
  availability:
    | 'available'
    | 'downloadable'
    | 'downloading'
    | 'unavailable'
    | 'unsupported' = 'available',
  options: {
    abortThrows?: boolean;
    acquireMicrophoneError?: MicrophoneAccessState | 'raw';
    emitRejects?: boolean;
    loadAvailabilityRejects?: boolean;
    observeLevelThrows?: boolean;
    qualitySupported?: boolean;
    startThrowsFor?: readonly number[];
    stopThrows?: boolean;
  } = {}
) {
  const events: (VoiceInputServerEvent | VoiceInputCaptureEvent)[] = [];
  const recognitions: FakeRecognition[] = [];
  const selectedTrack = { id: 'selected-track' } as MediaStreamTrack;
  const releaseMicrophone = vi.fn();
  const disposeLevelMonitor = vi.fn();
  let levelListener: ((frame: MicrophoneLevelFrame) => void) | undefined;
  const acquireMicrophone = options.acquireMicrophoneError
    ? vi
        .fn()
        .mockRejectedValue(
          options.acquireMicrophoneError === 'raw'
            ? new Error('private microphone detail')
            : new MicrophoneInputError(options.acquireMicrophoneError)
        )
    : vi.fn().mockResolvedValue({
        release: releaseMicrophone,
        track: selectedTrack,
      });
  const observeMicrophoneLevel = vi.fn(
    (_track: MediaStreamTrack, listener: (frame: MicrophoneLevelFrame) => void) => {
      if (options.observeLevelThrows) throw new Error('audio graph unavailable');
      levelListener = listener;
      return { dispose: disposeLevelMonitor };
    }
  );
  const loadAvailability = options.loadAvailabilityRejects
    ? vi.fn().mockRejectedValue(new Error('private availability detail'))
    : vi.fn().mockResolvedValue({
        apiFlavor: 'standard',
        availability,
        qualitySupported: options.qualitySupported ?? true,
      });
  const createCapture = vi.fn(() => ({
    finish: vi.fn(async () => ({
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      durationSeconds: 1,
    })),
    abort: vi.fn(),
  }));
  const normalizeAudio = vi.fn(async (input: VoiceAudioInput, _signal: AbortSignal) => input);
  const publishAudio = vi.fn<VoiceInputRecognitionDeps['publishAudio']>(async () => ({
    entryId: 'entry',
    incarnation: 'incarnation',
    epoch: 'epoch',
    revision: 1,
    audioDigest: 'sha256:' + 'a'.repeat(64),
  }));
  const service = createOffscreenVoiceInputService({
    createCapture,
    normalizeAudio,
    publishAudio,
    acquireMicrophone,
    createRecognition: ({ audioTrack, callbacks, processLocally }) => {
      const recognitionIndex = recognitions.length;
      const recognition: FakeRecognition = {
        audioTrack,
        abort: options.abortThrows
          ? vi.fn<() => void>(() => {
              throw new Error('already aborted');
            })
          : vi.fn<() => void>(),
        callbacks,
        dispose: vi.fn<() => void>(),
        flavor: 'standard',
        legacyBrowserManaged: false,
        processLocally,
        start: options.startThrowsFor?.includes(recognitionIndex)
          ? vi.fn<() => void>(() => {
              throw new Error('start failed');
            })
          : vi.fn<() => void>(),
        stop: options.stopThrows
          ? vi.fn<() => void>(() => {
              throw new Error('stop failed');
            })
          : vi.fn<() => void>(),
      };
      recognitions.push(recognition);
      return recognition;
    },
    emit: async (event) => {
      events.push(event);
      if (options.emitRejects) throw new Error('transport failed');
    },
    loadAvailability,
    observeMicrophoneLevel,
    resolveApi: () => ({
      constructor: null,
      flavor: 'standard',
      qualitySupported: options.qualitySupported ?? true,
    }),
  });
  return {
    createCapture,
    normalizeAudio,
    publishAudio,
    acquireMicrophone,
    disposeLevelMonitor,
    events,
    emitLevel: (level: number) =>
      levelListener?.({ level, peaks: Array.from({ length: 16 }, () => level) }),
    loadAvailability,
    recognitions,
    releaseMicrophone,
    selectedTrack,
    service,
  };
}

export async function flushStart(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

export function start(
  service: ReturnType<typeof createOffscreenVoiceInputService>,
  sessionId = 's1',
  maxDurationMs: number | null = null
) {
  return service.start({
    captureToken: {
      entryId: 'entry',
      incarnation: 'incarnation',
      epoch: 'epoch',
      sequence: 1,
      createdAt: 1,
    },
    maxDurationMs,
    preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
    requestId: `request-${sessionId}`,
    sessionId,
  });
}

export function transcript(text: string, isFinal = false): SpeechRecognitionResult {
  return { confidence: 0.75, isFinal, text };
}
