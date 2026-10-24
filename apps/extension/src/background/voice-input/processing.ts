import {
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  isVoiceInputErrorCode,
  type VoiceHistoryEntry,
  type VoiceHistoryScope,
  type VoiceInputErrorCode,
  type VoiceInputLanguage,
  type VoiceInputPreferences,
  type VoiceProviderSelection,
} from '@sniptale/runtime-contracts/voice-input';
import {
  VoiceHistoryError,
  type VoiceInputHistory,
} from '../../composition/persistence/voice-input-history';
import { loadVoiceInputCorrectionSystemPrompt } from '../../composition/persistence/ai-settings';
import { resolveTranscriptionModelConfig, type AudioModelConfig } from '../ai/audio/model-config';
import { requestTranscription } from '../ai/audio/request';
import { correctVoiceTranscript } from '../ai/llm/voice-correction';

type ProcessingHistory = Pick<
  VoiceInputHistory,
  'get' | 'readAudio' | 'beginProcessing' | 'saveRawTranscript' | 'complete' | 'fail'
>;

interface VoiceTranscriptionInput {
  selection: VoiceProviderSelection;
  input: File;
  durationSeconds: number;
  language: VoiceInputLanguage;
  signal: AbortSignal;
  beforeSend(): Promise<void>;
}

interface VoiceProcessingArgs {
  scope: VoiceHistoryScope;
  preferences: VoiceInputPreferences;
  browserTranscript?: string;
  signal: AbortSignal;
  /** Reports every successful storage mutation to the operation owner. */
  onScope?(scope: VoiceHistoryScope): void;
  /** Revalidates the operation permit after each awaited source admission. */
  beforeSend?(): Promise<void> | void;
  onPhase?(phase: 'processing-asr' | 'processing-text', scope: VoiceHistoryScope): void;
  /** Reports recoverable text again when its admitted storage revision advances. */
  onRawTranscript?(text: string, scope: VoiceHistoryScope): void;
}

function applyVoiceLanguage(
  config: AudioModelConfig,
  language: VoiceInputLanguage
): AudioModelConfig {
  if (!config.transcription) throw new Error('model-unavailable');
  return {
    ...config,
    transcription: { ...config.transcription, language: language === 'ru-RU' ? 'ru' : 'en' },
  };
}

async function transcribeVoiceAudio(args: VoiceTranscriptionInput): Promise<string> {
  const config = applyVoiceLanguage(
    await resolveTranscriptionModelConfig(args.selection, args.signal),
    args.language
  );
  const input = new File(
    [args.input],
    args.input.type === 'audio/wav' ? 'dictation.wav' : 'dictation.webm',
    { type: args.input.type }
  );
  const result = await requestTranscription({
    config,
    input,
    durationSeconds: args.durationSeconds,
    signal: args.signal,
    ...(config.transcription?.transport === 'audio-chat'
      ? {
          recognition: {
            mode: 'transcribe' as const,
            granularity: 'sentence' as const,
            prompt: '',
          },
        }
      : {}),
    beforeSend: async () => {
      args.signal.throwIfAborted();
      const current = applyVoiceLanguage(
        await resolveTranscriptionModelConfig(args.selection, args.signal),
        args.language
      );
      if (JSON.stringify(config) !== JSON.stringify(current)) throw new Error('model-unavailable');
      args.signal.throwIfAborted();
      await args.beforeSend();
    },
    onReceiving() {},
  });
  return result.text;
}

/** Maps failures to fixed public codes without exposing provider or storage error bodies. */
export function getVoiceInputProcessingErrorCode(error: unknown): VoiceInputErrorCode {
  if (error instanceof VoiceHistoryError) return error.code;
  if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
  if (!(error instanceof Error)) return 'provider-failed';
  if (isVoiceInputErrorCode(error.message)) return error.message;
  if (error.message === 'network-failed') return 'network';
  if (error.message === 'secret-unavailable') return 'model-unavailable';
  return 'provider-failed';
}

/** Processes one admitted recording. The caller owns cancellation, deadlines, and job lifetime. */
export function createVoiceInputProcessor(deps: {
  history: ProcessingHistory;
  loadCorrectionPrompt?: () => Promise<string>;
  transcribe?: (args: VoiceTranscriptionInput) => Promise<string>;
  correct?: typeof correctVoiceTranscript;
}) {
  const transcribe = deps.transcribe ?? transcribeVoiceAudio;
  const correct = deps.correct ?? correctVoiceTranscript;
  const loadPrompt = deps.loadCorrectionPrompt ?? loadVoiceInputCorrectionSystemPrompt;

  async function recognize(
    args: VoiceProcessingArgs,
    scope: VoiceHistoryScope,
    durationSeconds: number,
    assertCurrent: () => Promise<void>
  ): Promise<string> {
    if (args.browserTranscript !== undefined) return args.browserTranscript;
    if (!args.preferences.transcription) throw new Error('model-unavailable');
    const input = await deps.history.readAudio(scope, args.signal);
    await assertCurrent();
    return transcribe({
      selection: args.preferences.transcription,
      input,
      durationSeconds,
      language: args.preferences.language,
      signal: args.signal,
      beforeSend: assertCurrent,
    });
  }

  async function correctRaw(
    args: VoiceProcessingArgs,
    scope: VoiceHistoryScope,
    raw: string,
    assertCurrent: () => Promise<void>
  ): Promise<{ transcript: string; correctionStatus: VoiceHistoryEntry['correctionStatus'] }> {
    if (args.preferences.backend !== 'model' || !args.preferences.correction?.enabled)
      return { transcript: raw, correctionStatus: 'off' };
    args.onPhase?.('processing-text', scope);
    try {
      if (!args.preferences.correction.model) throw new Error('model-unavailable');
      const prompt = await loadPrompt();
      await assertCurrent();
      const transcript = await correct({
        selection: args.preferences.correction.model,
        transcript: raw,
        prompt,
        signal: args.signal,
        beforeSend: assertCurrent,
      });
      await assertCurrent();
      if (!transcript.trim() || transcript.length > VOICE_INPUT_TRANSCRIPT_MAX_CHARS)
        throw new Error('invalid-response');
      return { transcript, correctionStatus: 'applied' };
    } catch (error) {
      await assertCurrent();
      if (getVoiceInputProcessingErrorCode(error) === 'stale') throw error;
      return { transcript: raw, correctionStatus: 'failed' };
    }
  }

  async function recordFailure(
    args: VoiceProcessingArgs,
    scope: VoiceHistoryScope,
    error: unknown,
    recoverableRaw: boolean
  ): Promise<void> {
    const timedOut =
      args.signal.aborted && getVoiceInputProcessingErrorCode(args.signal.reason) === 'timeout';
    const cancelled = args.signal.aborted && !timedOut;
    const code = timedOut
      ? 'timeout'
      : cancelled
        ? 'aborted'
        : getVoiceInputProcessingErrorCode(error);
    if (code === 'stale' || (!args.signal.aborted && recoverableRaw)) return;
    const failed = await deps.history
      .fail(scope, { status: cancelled ? 'cancelled' : 'failed', failureCode: code })
      .catch(() => undefined);
    if (failed) args.onScope?.(failed);
  }

  async function run(args: VoiceProcessingArgs): Promise<VoiceHistoryEntry> {
    let scope = args.scope;
    let recoverableRaw = false;
    const assertCurrent = async () => {
      args.signal.throwIfAborted();
      await deps.history.get(scope);
      await args.beforeSend?.();
      args.signal.throwIfAborted();
    };
    try {
      const source = await deps.history.get(scope);
      args.signal.throwIfAborted();
      scope = await deps.history.beginProcessing(scope);
      args.onScope?.(scope);
      await assertCurrent();
      args.onPhase?.('processing-asr', scope);
      const rawTranscript = await recognize(args, scope, source.durationSeconds, assertCurrent);
      await assertCurrent();
      if (!rawTranscript.trim()) throw new Error('no-speech');
      if (rawTranscript.length > VOICE_INPUT_TRANSCRIPT_MAX_CHARS) throw new Error('too-large');
      recoverableRaw = true;
      args.onRawTranscript?.(rawTranscript, scope);
      scope = await deps.history.saveRawTranscript(scope, rawTranscript);
      args.onScope?.(scope);
      await assertCurrent();
      args.onRawTranscript?.(rawTranscript, scope);
      const corrected = await correctRaw(args, scope, rawTranscript, assertCurrent);
      await assertCurrent();
      const completed = await deps.history.complete(scope, { rawTranscript, ...corrected });
      args.onScope?.(completed);
      return completed;
    } catch (error) {
      await recordFailure(args, scope, error, recoverableRaw);
      throw error;
    }
  }
  return { run };
}
