import type { AIProviderType } from '../../../../apps/extension/src/contracts/settings/ai-provider';
import type { AIModelAudioParameters } from '../../../../apps/extension/src/contracts/settings/model-operation';

export interface LiveModel {
  readonly modelId: string;
  readonly displayName: string;
  readonly audio?: AIModelAudioParameters | undefined;
}

export interface LiveProfile {
  readonly id: string;
  readonly label: string;
  readonly connectionType: AIProviderType;
  readonly endpoint: string;
  readonly management: 'automatic' | 'manual';
  readonly models: Readonly<
    Partial<Record<'text' | 'transcription' | 'speech', LiveModel | undefined>>
  >;
}

export const LIVE_PROFILES: Readonly<Record<string, LiveProfile>> = {
  neuraldeep: {
    id: 'neuraldeep',
    label: 'neuraldeep.ru',
    connectionType: 'neuraldeep',
    endpoint: 'https://api.neuraldeep.ru/v1',
    management: 'automatic',
    models: {
      text: { modelId: 'qwen3.6-35b-a3b-noreason', displayName: 'qwen3.6-35b-a3b-noreason' },
      transcription: {
        modelId: 'whisper-1',
        displayName: 'whisper-1',
        audio: { transcription: { responseFormat: 'verbose_json', timestampGranularity: 'word' } },
      },
      speech: {
        modelId: 'qwen3-tts',
        displayName: 'qwen3-tts',
        audio: { speech: { voiceId: 'vivian', responseFormat: 'wav' } },
      },
    },
  },
  routerai: {
    id: 'routerai',
    label: 'RouterAI',
    connectionType: 'openai-compatible',
    endpoint: 'https://routerai.ru/api/v1',
    management: 'manual',
    models: {
      transcription: {
        modelId: 'google/gemini-2.5-flash',
        displayName: 'Live Gemini transcription',
        audio: {
          transcription: {
            transport: 'audio-chat',
            chatProtocol: 'openai',
            structuredOutput: 'json_object',
            responseFormat: 'json',
            timestampGranularity: 'none',
          },
        },
      },
    },
  },
};
