import type {
  createSpeechRecognitionSession,
  resolveSpeechRecognitionApi,
  SpeechRecognitionResult,
} from '@sniptale/platform/browser/speech-recognition';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  type VoiceInputApiFlavor,
  type VoiceInputEffectiveMode,
  type VoiceInputErrorCode,
  type VoiceInputFallbackReason,
  type VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';

const logger = createLogger({ namespace: 'OffscreenSpeechRecognition' });
const START_TIMEOUT_MS = 5_000;
const UNEXPECTED_END_RESTART_BASE_DELAY_MS = 250;
const UNEXPECTED_END_RESTART_MAX_DELAY_MS = 2_000;
const UNEXPECTED_END_RESTART_MAX_ATTEMPTS_WITHOUT_TRANSCRIPT = 4;

type RecognitionSession = ReturnType<typeof createSpeechRecognitionSession>;

type RecognitionInstanceCallbacks = {
  isCurrent(): boolean;
  onFinished(errorCode: VoiceInputErrorCode | null): void;
  onListening(): void;
  onStarting(args: {
    apiFlavor: VoiceInputApiFlavor;
    effectiveMode: VoiceInputEffectiveMode;
    fallbackReason: VoiceInputFallbackReason | null;
  }): void;
  onTranscript(result: SpeechRecognitionResult & { sequence: number; text: string }): void;
};

export type VoiceInputRecognitionInstance = {
  dispose(abort: boolean): void;
  start(
    effectiveMode: VoiceInputEffectiveMode,
    fallbackReason: VoiceInputFallbackReason | null,
    audioTrack: MediaStreamTrack
  ): void;
  stop(): boolean;
};

function mapRecognitionError(errorCode: string): VoiceInputErrorCode {
  switch (errorCode) {
    case 'not-allowed':
      return 'permission-denied';
    case 'audio-capture':
      return 'microphone-unavailable';
    case 'no-speech':
      return 'no-speech';
    case 'language-not-supported':
      return 'language-not-supported';
    case 'network':
      return 'network';
    case 'service-not-allowed':
      return 'service-not-allowed';
    case 'aborted':
      return 'aborted';
    default:
      return 'unexpected';
  }
}

function supportsLocalFallback(errorCode: VoiceInputErrorCode): boolean {
  return (
    errorCode === 'language-not-supported' ||
    errorCode === 'network' ||
    errorCode === 'service-not-allowed'
  );
}

class RecognitionInstance implements VoiceInputRecognitionInstance {
  private fallbackUsed = false;
  private hasTranscript = false;
  private instanceGeneration = 0;
  private recognition: RecognitionSession | null = null;
  private restartAttemptsWithoutTranscript = 0;
  private restartTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  private sequence = 0;
  private startTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  private stopRequested = false;
  private audioTrack: MediaStreamTrack | null = null;

  constructor(
    private readonly args: {
      callbacks: RecognitionInstanceCallbacks;
      createRecognition: typeof createSpeechRecognitionSession;
      preferences: VoiceInputPreferences;
      resolveApi: typeof resolveSpeechRecognitionApi;
      sessionId: string;
    }
  ) {}

  start(
    effectiveMode: VoiceInputEffectiveMode,
    fallbackReason: VoiceInputFallbackReason | null,
    audioTrack: MediaStreamTrack
  ): void {
    this.restartAttemptsWithoutTranscript = 0;
    this.startRecognition(effectiveMode, fallbackReason, audioTrack, false);
  }

  private startRecognition(
    effectiveMode: VoiceInputEffectiveMode,
    fallbackReason: VoiceInputFallbackReason | null,
    audioTrack: MediaStreamTrack,
    recoveringUnexpectedEnd: boolean
  ): void {
    if (this.stopRequested || !this.args.callbacks.isCurrent()) return;
    this.fallbackUsed ||= fallbackReason !== null;
    this.audioTrack = audioTrack;
    this.clearRestartTimeout();
    this.clearStartTimeout();
    this.detach(true);
    this.instanceGeneration += 1;
    const instanceGeneration = this.instanceGeneration;
    try {
      const recognition = this.args.createRecognition({
        callbacks: {
          onAudioStart: () => {
            if (this.stopRequested || !this.isCurrent(instanceGeneration)) return;
            this.clearStartTimeout();
            this.args.callbacks.onListening();
            logger.debug('Voice input audio capture started', {
              effectiveMode,
              language: this.args.preferences.language,
              sessionId: this.args.sessionId,
            });
          },
          onEnd: () =>
            this.handleEnd(instanceGeneration, effectiveMode, fallbackReason, audioTrack),
          onError: (rawErrorCode) =>
            this.handleError(instanceGeneration, effectiveMode, rawErrorCode),
          onResult: (result) => this.handleResult(instanceGeneration, result),
          onStart: () => {
            if (this.stopRequested || !this.isCurrent(instanceGeneration)) return;
            logger.debug('Voice input recognition service started', {
              effectiveMode,
              language: this.args.preferences.language,
              sessionId: this.args.sessionId,
            });
          },
        },
        audioTrack,
        language: this.args.preferences.language,
        processLocally: effectiveMode === 'local',
      });
      this.recognition = recognition;
      if (!recoveringUnexpectedEnd) {
        this.args.callbacks.onStarting({
          apiFlavor: recognition.flavor,
          effectiveMode: recognition.legacyBrowserManaged ? 'legacy' : effectiveMode,
          fallbackReason,
        });
      }
      this.startTimeoutId = globalThis.setTimeout(() => {
        if (!this.isCurrent(instanceGeneration)) return;
        if (this.canFallback(effectiveMode)) {
          this.useBrowserFallback();
          return;
        }
        this.args.callbacks.onFinished('timeout');
      }, START_TIMEOUT_MS);
      recognition.start();
    } catch {
      this.clearStartTimeout();
      if (this.canFallback(effectiveMode)) {
        this.useBrowserFallback();
        return;
      }
      this.args.callbacks.onFinished(
        this.args.resolveApi().constructor ? 'unexpected' : 'unsupported'
      );
    }
  }

  stop(): boolean {
    this.stopRequested = true;
    this.clearRestartTimeout();
    this.clearStartTimeout();
    const recognition = this.recognition;
    if (!recognition) return false;
    try {
      recognition.stop();
      return true;
    } catch {
      return false;
    }
  }

  dispose(abort: boolean): void {
    this.clearRestartTimeout();
    this.clearStartTimeout();
    this.detach(abort);
  }

  private isCurrent(instanceGeneration: number): boolean {
    return this.args.callbacks.isCurrent() && this.instanceGeneration === instanceGeneration;
  }

  private canFallback(effectiveMode: VoiceInputEffectiveMode): boolean {
    return (
      !this.stopRequested && effectiveMode === 'local' && !this.fallbackUsed && !this.hasTranscript
    );
  }

  private clearStartTimeout(): void {
    if (this.startTimeoutId !== null) globalThis.clearTimeout(this.startTimeoutId);
    this.startTimeoutId = null;
  }

  private clearRestartTimeout(): void {
    if (this.restartTimeoutId !== null) globalThis.clearTimeout(this.restartTimeoutId);
    this.restartTimeoutId = null;
  }

  private detach(abort: boolean): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.dispose();
    if (!abort) return;
    try {
      recognition.abort();
    } catch {
      logger.debug('Voice input abort was already complete', {
        sessionId: this.args.sessionId,
      });
    }
  }

  private useBrowserFallback(): void {
    this.fallbackUsed = true;
    logger.warn('Falling back to browser-managed voice input', {
      fallbackReason: 'local-start-failed',
      sessionId: this.args.sessionId,
    });
    const audioTrack = this.audioTrack;
    if (!audioTrack) {
      this.args.callbacks.onFinished('microphone-unavailable');
      return;
    }
    this.start('browser-managed', 'local-start-failed', audioTrack);
  }

  private handleEnd(
    instanceGeneration: number,
    effectiveMode: VoiceInputEffectiveMode,
    fallbackReason: VoiceInputFallbackReason | null,
    audioTrack: MediaStreamTrack
  ): void {
    if (!this.isCurrent(instanceGeneration)) return;
    this.clearStartTimeout();
    this.detach(false);
    if (this.stopRequested) {
      this.args.callbacks.onFinished(null);
      return;
    }
    if (
      this.restartAttemptsWithoutTranscript >=
      UNEXPECTED_END_RESTART_MAX_ATTEMPTS_WITHOUT_TRANSCRIPT
    ) {
      logger.warn('Voice input recognition repeatedly ended without transcript', {
        effectiveMode,
        restartAttempts: this.restartAttemptsWithoutTranscript,
        sessionId: this.args.sessionId,
      });
      this.args.callbacks.onFinished(null);
      return;
    }
    this.restartAttemptsWithoutTranscript += 1;
    const restartDelayMs = Math.min(
      UNEXPECTED_END_RESTART_BASE_DELAY_MS *
        2 ** Math.max(0, this.restartAttemptsWithoutTranscript - 1),
      UNEXPECTED_END_RESTART_MAX_DELAY_MS
    );
    logger.warn('Voice input recognition ended before the session deadline', {
      effectiveMode,
      restartAttempt: this.restartAttemptsWithoutTranscript,
      restartDelayMs,
      sessionId: this.args.sessionId,
    });
    this.restartTimeoutId = globalThis.setTimeout(() => {
      this.restartTimeoutId = null;
      if (this.stopRequested || !this.args.callbacks.isCurrent()) return;
      logger.debug('Restarting voice input recognition inside the active session', {
        effectiveMode,
        restartAttempt: this.restartAttemptsWithoutTranscript,
        sessionId: this.args.sessionId,
      });
      this.startRecognition(effectiveMode, fallbackReason, audioTrack, true);
    }, restartDelayMs);
  }

  private handleError(
    instanceGeneration: number,
    effectiveMode: VoiceInputEffectiveMode,
    rawErrorCode: string
  ): void {
    if (this.stopRequested || !this.isCurrent(instanceGeneration)) return;
    const errorCode = mapRecognitionError(rawErrorCode);
    logger.warn('Voice input recognition error', {
      effectiveMode,
      errorCode,
      sessionId: this.args.sessionId,
    });
    if (this.canFallback(effectiveMode) && supportsLocalFallback(errorCode)) {
      this.useBrowserFallback();
      return;
    }
    this.args.callbacks.onFinished(errorCode);
  }

  private handleResult(instanceGeneration: number, result: SpeechRecognitionResult): void {
    if (this.stopRequested || !this.isCurrent(instanceGeneration)) return;
    this.hasTranscript = true;
    this.restartAttemptsWithoutTranscript = 0;
    this.sequence += 1;
    const text = result.text.slice(0, VOICE_INPUT_TRANSCRIPT_MAX_CHARS);
    this.args.callbacks.onTranscript({ ...result, sequence: this.sequence, text });
    logger.debug('Voice input transcript event', {
      charCount: text.length,
      confidence: result.confidence,
      isFinal: result.isFinal,
      sequence: this.sequence,
      sessionId: this.args.sessionId,
    });
  }
}

export function createVoiceInputRecognitionInstance(args: {
  callbacks: RecognitionInstanceCallbacks;
  createRecognition: typeof createSpeechRecognitionSession;
  preferences: VoiceInputPreferences;
  resolveApi: typeof resolveSpeechRecognitionApi;
  sessionId: string;
}): VoiceInputRecognitionInstance {
  return new RecognitionInstance(args);
}
