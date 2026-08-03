import type {
  createSpeechRecognitionSession,
  loadSpeechRecognitionAvailability,
  resolveSpeechRecognitionApi,
} from '@sniptale/platform/browser/speech-recognition';
import {
  MicrophoneInputError,
  type MicrophoneInputAcquisition,
  type MicrophoneLevelMonitor,
  type acquireMicrophoneInput,
  type observeMicrophoneLevel,
} from '@sniptale/platform/browser/user-media';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  VoiceInputPortMessageType,
  type VoiceInputErrorCode,
  type VoiceInputFallbackReason,
  type VoiceInputLocalAvailability,
  type VoiceInputPreferences,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { OffscreenMediaActivityLease } from '../media-activity/lease';
import {
  createVoiceInputRecognitionInstance,
  type VoiceInputRecognitionInstance,
} from './recognition-instance';

const logger = createLogger({ namespace: 'OffscreenSpeechRecognition' });
const AVAILABILITY_TIMEOUT_MS = 5_000;
const STOP_GRACE_MS = 1_000;

export type VoiceInputRecognitionDeps = {
  acquireMicrophone: typeof acquireMicrophoneInput;
  createRecognition: typeof createSpeechRecognitionSession;
  emit(event: VoiceInputServerEvent): Promise<unknown>;
  loadAvailability: typeof loadSpeechRecognitionAvailability;
  observeMicrophoneLevel: typeof observeMicrophoneLevel;
  resolveApi: typeof resolveSpeechRecognitionApi;
};

type RecognitionRunCallbacks = {
  isCurrent(run: VoiceInputRecognitionRun): boolean;
  onFinished(run: VoiceInputRecognitionRun, snapshot: VoiceInputSnapshot): void;
  onSnapshot(snapshot: VoiceInputSnapshot): void;
};

type RecognitionRunArgs = {
  callbacks: RecognitionRunCallbacks;
  deps: VoiceInputRecognitionDeps;
  initialSnapshot: VoiceInputSnapshot;
  lease: OffscreenMediaActivityLease;
  maxDurationMs: number | null;
  preferences: VoiceInputPreferences;
  requestId: string;
  sessionId: string;
};

export type VoiceInputRecognitionRun = {
  abort(): void;
  getSnapshot(): VoiceInputSnapshot;
  preferences: VoiceInputPreferences;
  sessionId: string;
  start(): void;
  stop(): 'accepted';
};

function withTimeout<TValue>(work: Promise<TValue>, timeoutMs: number): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => reject(new Error('timeout')), timeoutMs);
    void work.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function mapMicrophoneInputError(error: unknown): VoiceInputErrorCode {
  const state = error instanceof MicrophoneInputError ? error.state : 'unknown';
  if (state === 'denied') return 'permission-denied';
  if (state === 'device-busy') return 'microphone-busy';
  if (state === 'no-device' || state === 'unavailable') return 'microphone-unavailable';
  return 'unexpected';
}

function resolveAvailabilityFallback(args: {
  availability: VoiceInputLocalAvailability;
  qualitySupported: boolean;
}): VoiceInputFallbackReason {
  if (!args.qualitySupported) return 'dictation-unsupported';
  if (args.availability === 'unsupported') return 'local-api-unsupported';
  if (args.availability === 'downloadable' || args.availability === 'downloading') {
    return 'dictation-unavailable';
  }
  return args.availability === 'unavailable' ? 'dictation-unavailable' : 'local-unavailable';
}

class RecognitionRun implements VoiceInputRecognitionRun {
  readonly preferences: VoiceInputPreferences;
  readonly sessionId: string;
  private finished = false;
  private readonly instance: VoiceInputRecognitionInstance;
  private snapshot: VoiceInputSnapshot;
  private microphone: MicrophoneInputAcquisition | null = null;
  private microphoneLevelMonitor: MicrophoneLevelMonitor | null = null;
  private stopTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  private watchdogId: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(private readonly args: RecognitionRunArgs) {
    this.preferences = args.preferences;
    this.sessionId = args.sessionId;
    this.snapshot = args.initialSnapshot;
    this.instance = createVoiceInputRecognitionInstance({
      callbacks: {
        isCurrent: () => this.isCurrent(),
        onFinished: (errorCode) => this.finish(errorCode === null ? 'ended' : 'error', errorCode),
        onListening: () => {
          this.updateSnapshot({ phase: 'listening' });
          this.emitSnapshot();
        },
        onStarting: (state) => {
          this.updateSnapshot({ ...state, phase: 'starting' });
          this.emitSnapshot();
        },
        onTranscript: (result) => {
          this.emit({
            confidence: result.confidence,
            isFinal: result.isFinal,
            sequence: result.sequence,
            sessionId: this.sessionId,
            text: result.text,
            type: VoiceInputPortMessageType.TRANSCRIPT,
          });
        },
      },
      createRecognition: args.deps.createRecognition,
      preferences: args.preferences,
      resolveApi: args.deps.resolveApi,
      sessionId: args.sessionId,
    });
  }

  getSnapshot(): VoiceInputSnapshot {
    return this.snapshot;
  }

  start(): void {
    this.emitSnapshot(this.args.requestId);
    if (this.args.maxDurationMs !== null) {
      this.watchdogId = globalThis.setTimeout(() => {
        if (!this.isCurrent()) return;
        logger.debug('Voice input reached the session time limit', {
          sessionId: this.sessionId,
          timeoutMs: this.args.maxDurationMs,
        });
        this.stop();
      }, this.args.maxDurationMs);
    }
    void this.resolveStartMode();
  }

  stop(): 'accepted' {
    if (this.snapshot.phase === 'stopping') return 'accepted';
    if (this.watchdogId !== null) globalThis.clearTimeout(this.watchdogId);
    this.watchdogId = null;
    this.updateSnapshot({ phase: 'stopping' });
    this.emitSnapshot();
    if (!this.instance.stop()) {
      this.finish('ended', null);
      return 'accepted';
    }
    this.stopTimeoutId = globalThis.setTimeout(() => {
      if (!this.isCurrent()) return;
      this.instance.dispose(true);
      this.finish('ended', null);
    }, STOP_GRACE_MS);
    return 'accepted';
  }

  abort(): void {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    this.instance.dispose(true);
    this.releaseMicrophone();
    this.args.lease.release();
  }

  private isCurrent(): boolean {
    return !this.finished && this.args.callbacks.isCurrent(this);
  }

  private updateSnapshot(patch: Partial<VoiceInputSnapshot>): void {
    const previousPhase = this.snapshot.phase;
    this.snapshot = { ...this.snapshot, ...patch };
    this.args.callbacks.onSnapshot(this.snapshot);
    if (previousPhase !== this.snapshot.phase) {
      logger.debug('Voice input phase changed', {
        apiFlavor: this.snapshot.apiFlavor,
        effectiveMode: this.snapshot.effectiveMode,
        errorCode: this.snapshot.errorCode,
        fallbackReason: this.snapshot.fallbackReason,
        from: previousPhase,
        sessionId: this.sessionId,
        to: this.snapshot.phase,
      });
    }
  }

  private emit(event: VoiceInputServerEvent): void {
    void this.args.deps.emit(event).catch(() => {
      logger.warn('Failed to deliver voice input event', {
        eventType: event.type,
        sessionId: 'sessionId' in event ? (event.sessionId ?? null) : event.snapshot.sessionId,
      });
    });
  }

  private emitSnapshot(requestId?: string): void {
    this.emit({
      ...(requestId === undefined ? {} : { requestId }),
      snapshot: this.snapshot,
      type: VoiceInputPortMessageType.SNAPSHOT,
    });
  }

  private clearTimers(): void {
    for (const timeoutId of [this.stopTimeoutId, this.watchdogId]) {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    }
    this.stopTimeoutId = null;
    this.watchdogId = null;
  }

  private finish(phase: 'ended' | 'error', errorCode: VoiceInputErrorCode | null): void {
    if (!this.isCurrent()) return;
    this.clearTimers();
    this.instance.dispose(phase === 'error');
    this.releaseMicrophone();
    this.args.lease.release();
    this.updateSnapshot({ busyOwner: null, errorCode, phase, sessionId: this.sessionId });
    this.finished = true;
    this.args.callbacks.onFinished(this, this.snapshot);
    if (errorCode) {
      this.emit({
        errorCode,
        sessionId: this.sessionId,
        snapshot: this.snapshot,
        type: VoiceInputPortMessageType.FAILURE,
      });
    } else {
      this.emitSnapshot();
    }
    logger.debug('Voice input session finished', { errorCode, phase, sessionId: this.sessionId });
  }

  private useBrowserFallback(reason: VoiceInputFallbackReason): void {
    const details = {
      fallbackReason: reason,
      sessionId: this.sessionId,
    };
    if (
      reason === 'dictation-unavailable' ||
      reason === 'dictation-unsupported' ||
      reason === 'local-api-unsupported' ||
      reason === 'local-unavailable'
    ) {
      logger.debug('Using browser-managed voice input after capability check', details);
    } else {
      logger.warn('Falling back to browser-managed voice input', details);
    }
    const track = this.microphone?.track;
    if (!track) {
      this.finish('error', 'microphone-unavailable');
      return;
    }
    this.instance.start('browser-managed', reason, track);
  }

  private async resolveStartMode(): Promise<void> {
    if (!(await this.acquireSelectedMicrophone())) return;
    const track = this.microphone?.track;
    if (!track || !this.isCurrent()) return;
    if (this.preferences.mode === 'browser-managed') {
      this.instance.start('browser-managed', null, track);
      return;
    }
    await this.startLocalFirst(track);
  }

  private async acquireSelectedMicrophone(): Promise<boolean> {
    try {
      const microphone = await this.args.deps.acquireMicrophone(
        this.preferences.microphoneDeviceId
      );
      if (!this.isCurrent()) {
        microphone.release();
        return false;
      }
      this.microphone = microphone;
      this.startMicrophoneLevelMonitor(microphone.track);
      logger.debug('Selected microphone acquired', {
        microphoneSelected: this.preferences.microphoneDeviceId !== null,
        sessionId: this.sessionId,
      });
      return true;
    } catch (error) {
      if (!this.isCurrent()) return false;
      const errorCode = mapMicrophoneInputError(error);
      logger.warn('Selected microphone acquisition failed', {
        errorCode,
        sessionId: this.sessionId,
      });
      this.finish('error', errorCode);
      return false;
    }
  }

  private startMicrophoneLevelMonitor(track: MediaStreamTrack): void {
    try {
      this.microphoneLevelMonitor = this.args.deps.observeMicrophoneLevel(track, (frame) => {
        if (!this.isCurrent()) return;
        this.emit({
          ...frame,
          sessionId: this.sessionId,
          type: VoiceInputPortMessageType.AUDIO_LEVEL,
        });
      });
    } catch {
      logger.warn('Microphone level monitor is unavailable', { sessionId: this.sessionId });
    }
  }

  private async startLocalFirst(track: MediaStreamTrack): Promise<void> {
    this.updateSnapshot({ phase: 'checking' });
    this.emitSnapshot(this.args.requestId);
    const startedAt = performance.now();
    try {
      const availability = await withTimeout(
        this.args.deps.loadAvailability({
          language: this.preferences.language,
          processLocally: true,
        }),
        AVAILABILITY_TIMEOUT_MS
      );
      if (!this.isCurrent()) return;
      this.updateSnapshot({
        apiFlavor: availability.apiFlavor,
        localAvailability: availability.availability,
        qualitySupported: availability.qualitySupported,
      });
      logger.debug('Checked local dictation availability', {
        apiFlavor: availability.apiFlavor,
        availability: availability.availability,
        durationMs: Math.round(performance.now() - startedAt),
        language: this.preferences.language,
        quality: VOICE_INPUT_LOCAL_QUALITY,
        qualitySupported: availability.qualitySupported,
        sessionId: this.sessionId,
      });
      if (availability.availability === 'available' && availability.qualitySupported) {
        this.instance.start('local', null, track);
        return;
      }
      this.useBrowserFallback(
        resolveAvailabilityFallback({
          availability: availability.availability,
          qualitySupported: availability.qualitySupported,
        })
      );
    } catch {
      if (!this.isCurrent()) return;
      logger.warn('Local dictation availability check failed', {
        durationMs: Math.round(performance.now() - startedAt),
        fallbackReason: 'local-check-failed',
        sessionId: this.sessionId,
      });
      this.useBrowserFallback('local-check-failed');
    }
  }

  private releaseMicrophone(): void {
    this.microphoneLevelMonitor?.dispose();
    this.microphoneLevelMonitor = null;
    this.microphone?.release();
    this.microphone = null;
  }
}

export function createVoiceInputRecognitionRun(args: RecognitionRunArgs): VoiceInputRecognitionRun {
  return new RecognitionRun(args);
}
