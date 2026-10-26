import {
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  type VoiceProviderSelection,
} from '@sniptale/runtime-contracts/voice-input';
import { resolveModelConfig } from './model-config';
import { requestChatCompletion } from './transport/request';

/** Corrects dictated text through the existing transport and the exact configured provider. */
export async function correctVoiceTranscript(args: {
  selection: VoiceProviderSelection;
  transcript: string;
  prompt: string;
  signal: AbortSignal;
  beforeSend(): Promise<void>;
}): Promise<string> {
  args.signal.throwIfAborted();
  if (!args.transcript.trim()) throw new Error('no-speech');
  if (args.transcript.length > VOICE_INPUT_TRANSCRIPT_MAX_CHARS || args.prompt.length > 10000)
    throw new Error('too-large');
  const approved = { ...args.selection, signal: args.signal };
  const config = await resolveModelConfig(args.selection.modelId, approved);
  const result = await requestChatCompletion({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelCode: config.modelCode,
    connectionType: config.connectionType,
    ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
    systemPrompt: args.prompt,
    userPrompt: args.transcript,
    signal: args.signal,
    rejectTruncated: true,
    beforeSend: async () => {
      args.signal.throwIfAborted();
      const current = await resolveModelConfig(args.selection.modelId, approved);
      if (JSON.stringify(current) !== JSON.stringify(config)) throw new Error('model-unavailable');
      args.signal.throwIfAborted();
      await args.beforeSend();
    },
  });
  args.signal.throwIfAborted();
  const text = result.trim();
  if (!text) throw new Error('invalid-response');
  if (text.length > VOICE_INPUT_TRANSCRIPT_MAX_CHARS) throw new Error('too-large');
  return text;
}
