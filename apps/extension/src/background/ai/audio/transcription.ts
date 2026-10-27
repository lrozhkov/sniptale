import type { JSONObject, TranscriptionModelV4Result } from '@ai-sdk/provider';
import type { AudioTranscriptResult } from '../../../contracts/ai/audio';
import type { AIProviderType } from '../../../contracts/settings/ai-provider';
import type { AITranscriptionModelParameters } from '../../../contracts/settings/model-operation';
import { parseAudioTranscriptResponse } from './response';

function isCompatible(type: AIProviderType): boolean {
  return ['openai-compatible', 'openai', 'neuraldeep', 'lm-studio'].includes(type);
}

/** Maps only documented SDK options without accessing credentials or performing network effects. */
export function getTranscriptionProviderOptions(
  type: AIProviderType,
  params: AITranscriptionModelParameters,
  segmentFallback = true
): Record<string, JSONObject> {
  const granularity = params.timestampGranularity;
  if (isCompatible(type))
    return {
      openai: {
        responseFormat: params.responseFormat,
        timestampGranularities:
          granularity === 'word'
            ? segmentFallback
              ? ['word', 'segment']
              : ['word']
            : granularity === 'segment'
              ? ['segment']
              : [],
        ...(params.language ? { language: params.language } : {}),
        ...(params.prompt ? { prompt: params.prompt } : {}),
      },
    };
  if (params.prompt?.trim()) throw new Error('provider-request');
  const language = params.language;
  if (type === 'google')
    return {
      google: {
        mode: 'VERBATIM',
        wordTimestamp: granularity !== 'none',
        ...(language ? { languageCodes: [language] } : {}),
      },
    };
  if (type === 'elevenlabs')
    return {
      elevenlabs: {
        diarize: false,
        tagAudioEvents: false,
        timestampsGranularity: granularity === 'none' ? 'none' : 'word',
        ...(language ? { languageCode: language } : {}),
      },
    };
  if (type === 'deepgram')
    return {
      deepgram: { smartFormat: false, ...(language ? { language } : { detectLanguage: true }) },
    };
  if (type === 'xai') return { xai: { format: false, ...(language ? { language } : {}) } };
  if (type === 'mistral') {
    if (language && granularity !== 'none') throw new Error('provider-request');
    return {
      mistral: {
        ...(language ? { language } : {}),
        ...(granularity !== 'none' ? { timestampGranularities: [granularity] } : {}),
      },
    };
  }
  throw new Error('model-unavailable');
}

/** Applies local bounds to documented SDK results and retains both compatible timing arrays. */
export function admitSdkTranscript(
  result: TranscriptionModelV4Result,
  type: AIProviderType,
  granularity: AITranscriptionModelParameters['timestampGranularity'],
  durationSeconds: number
): AudioTranscriptResult {
  if (isCompatible(type)) {
    const admitted = parseAudioTranscriptResponse(result.response.body, durationSeconds);
    if (!admitted) throw new Error('invalid-response');
    return admitted;
  }
  const words = granularity === 'word';
  const timings = result.segments.map((entry) => ({
    [words ? 'word' : 'text']: entry.text,
    start: entry.startSecond,
    end: entry.endSecond,
  }));
  const admitted = parseAudioTranscriptResponse(
    {
      text: result.text,
      ...(result.language ? { language: result.language } : {}),
      [words ? 'words' : 'segments']: timings,
    },
    durationSeconds
  );
  if (!admitted) throw new Error('invalid-response');
  return admitted;
}
