/** A catalog entry has one operation; records predating audio remain text models. */
export type AIModelOperation = 'text' | 'transcription' | 'speech';

export interface AITranscriptionModelParameters {
  /** Missing transport preserves the existing Speech API configuration. */
  transport?: 'audio-api' | 'audio-chat';
  chatProtocol?: 'openai' | 'bothub';
  structuredOutput?: 'json_schema' | 'json_object';
  language?: string;
  prompt?: string;
  responseFormat: 'json' | 'verbose_json';
  timestampGranularity: 'none' | 'segment' | 'word';
}

export interface AISpeechModelParameters {
  voiceId: string;
  responseFormat: 'mp3' | 'wav' | 'pcm';
  speed?: number;
  instructions?: string;
}

export interface AIModelAudioParameters {
  transcription?: AITranscriptionModelParameters;
  speech?: AISpeechModelParameters;
}

export function getAIModelOperation(model: {
  operation?: AIModelOperation | undefined;
}): AIModelOperation {
  return model.operation ?? 'text';
}

export function filterAIModelsByOperation<T extends { operation?: AIModelOperation | undefined }>(
  models: T[],
  operation: AIModelOperation
): T[] {
  return models.filter((model) => getAIModelOperation(model) === operation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function optionalText(value: unknown, maximum: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maximum);
}

function isTranscription(value: unknown): value is AITranscriptionModelParameters {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'language',
      'prompt',
      'responseFormat',
      'timestampGranularity',
      'transport',
      'chatProtocol',
      'structuredOutput',
    ]) &&
    (value['transport'] === undefined ||
      value['transport'] === 'audio-api' ||
      value['transport'] === 'audio-chat') &&
    (value['transport'] === 'audio-chat'
      ? (value['chatProtocol'] === 'openai' || value['chatProtocol'] === 'bothub') &&
        (value['structuredOutput'] === 'json_schema' ||
          value['structuredOutput'] === 'json_object') &&
        value['responseFormat'] === 'json' &&
        value['timestampGranularity'] === 'none'
      : value['chatProtocol'] === undefined && value['structuredOutput'] === undefined) &&
    (value['language'] === undefined ||
      (typeof value['language'] === 'string' && /^[a-z]{2,3}$/.test(value['language']))) &&
    optionalText(value['prompt'], 10000) &&
    (value['responseFormat'] === 'json' || value['responseFormat'] === 'verbose_json') &&
    (value['timestampGranularity'] === 'none' ||
      value['timestampGranularity'] === 'segment' ||
      value['timestampGranularity'] === 'word') &&
    (value['timestampGranularity'] === 'none' || value['responseFormat'] === 'verbose_json')
  );
}

function isSpeech(value: unknown): value is AISpeechModelParameters {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['voiceId', 'responseFormat', 'speed', 'instructions']) &&
    typeof value['voiceId'] === 'string' &&
    value['voiceId'].trim().length > 0 &&
    value['voiceId'].length <= 200 &&
    (value['responseFormat'] === 'mp3' ||
      value['responseFormat'] === 'wav' ||
      value['responseFormat'] === 'pcm') &&
    (value['speed'] === undefined ||
      (typeof value['speed'] === 'number' &&
        Number.isFinite(value['speed']) &&
        value['speed'] >= 0.25 &&
        value['speed'] <= 4)) &&
    optionalText(value['instructions'], 10000)
  );
}

/** Validates declared parameters without inferring remote capabilities from model IDs. */
export function isValidAIModelOperationConfiguration(value: unknown): value is Record<
  string,
  unknown
> & {
  operation?: AIModelOperation | undefined;
  audio?: AIModelAudioParameters | undefined;
} {
  if (!isRecord(value)) return false;
  const operation = value['operation'];
  const audio = value['audio'];
  if (operation === undefined || operation === 'text') return audio === undefined;
  if (!isRecord(audio)) return false;
  if (operation === 'transcription') {
    return hasOnlyKeys(audio, ['transcription']) && isTranscription(audio['transcription']);
  }
  if (operation === 'speech') {
    return hasOnlyKeys(audio, ['speech']) && isSpeech(audio['speech']);
  }
  return false;
}
