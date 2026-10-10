import type { AudioRecognitionOptions, AudioTranscriptResult } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function transcriptionSchema(rewrite: boolean) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            start: { type: 'number' },
            end: { type: 'number' },
            ...(rewrite ? { originalText: { type: 'string' } } : {}),
          },
          required: rewrite ? ['text', 'originalText', 'start', 'end'] : ['text', 'start', 'end'],
        },
      },
    },
    required: ['segments'],
  };
}

/** Fixed timing and structure instructions remain code-owned; user instructions are additional. */
export function encodeChatTranscription(
  config: AudioModelConfig,
  options: AudioRecognitionOptions,
  duration: number,
  audio: string
): string {
  const params = config.transcription;
  if (params?.transport !== 'audio-chat') throw new Error('invalid-request');
  const schema = transcriptionSchema(options.mode === 'rewrite');
  const extra = [
    config.transcriptionInstructions,
    params.prompt,
    options.mode === 'rewrite' ? options.prompt : '',
  ]
    .filter(Boolean)
    .join('\n');
  const structural = [
    'Process the entire attached audio in its original language. Do not translate or invent speech.',
    'If audio is absent or silent, return {"segments":[]}.',
    `Audio-relative duration: ${duration} seconds. Split into ${options.granularity} units.`,
    'Preserve silent gaps and use actual speech boundaries. No overlapping segments.',
    'Do not stretch the last segment to the audio duration.',
    options.mode === 'rewrite'
      ? [
          'originalText must contain verbatim spoken text including punctuation.',
          'Apply additional instructions to text while retaining originalText and its actual interval.',
          'Never move text to an unrelated audio interval.',
        ].join(' ')
      : [
          'text must contain only verbatim spoken text including punctuation.',
          'Do not rewrite, summarize, change style, omit or translate speech regardless of additional instructions.',
        ].join(' '),
    `Mode: ${options.mode}. Return only JSON satisfying this exact schema: ${JSON.stringify(schema)}.`,
    'All segment text must be nonempty and at most 16000 characters. No Markdown or additional fields.',
    params.language ? `Requested speech language: ${params.language}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const format =
    params.structuredOutput === 'json_object'
      ? { type: 'json_object' }
      : { type: 'json_schema', json_schema: { name: 'timed_transcript', strict: true, schema } };
  const bothub = params.chatProtocol === 'bothub';
  return JSON.stringify({
    model: config.modelCode,
    messages: [
      { role: 'system', content: `${extra}\n\n${structural}` },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Process the attached complete audio using the requested mode and schema.',
          },
          bothub
            ? { type: 'image_url', image_url: { url: `data:audio/wav;base64,${audio}` } }
            : { type: 'input_audio', input_audio: { data: audio, format: 'wav' } },
        ],
      },
    ],
    ...(bothub
      ? { responseFormat: format, maxTokens: 24000 }
      : { response_format: format, max_tokens: 24000 }),
  });
}

/** Untrusted model JSON is admitted locally; HTTP success alone never admits a transcript. */
export function parseChatTranscription(
  value: unknown,
  duration: number,
  options: AudioRecognitionOptions
): AudioTranscriptResult | null {
  if (!record(value) || !Array.isArray(value['choices']) || value['choices'].length !== 1)
    return null;
  const choice: unknown = value['choices'][0];
  if (!record(choice) || choice['finish_reason'] !== 'stop' || !record(choice['message']))
    return null;
  const message = choice['message'];
  if (message['refusal'] || typeof message['content'] !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(message['content']);
  } catch {
    return null;
  }
  if (
    !record(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Array.isArray(parsed['segments']) ||
    parsed['segments'].length > 10000
  )
    return null;
  const segments: NonNullable<AudioTranscriptResult['segments']> = [];
  let totalText = 0;
  for (const entry of parsed['segments']) {
    if (
      !record(entry) ||
      Object.keys(entry).length !== (options.mode === 'rewrite' ? 4 : 3) ||
      typeof entry['text'] !== 'string' ||
      !entry['text'].trim() ||
      entry['text'].length > 16000 ||
      (options.mode === 'rewrite' &&
        (typeof entry['originalText'] !== 'string' ||
          !entry['originalText'].trim() ||
          entry['originalText'].length > 16000)) ||
      typeof entry['start'] !== 'number' ||
      !Number.isFinite(entry['start']) ||
      entry['start'] < 0 ||
      typeof entry['end'] !== 'number' ||
      !Number.isFinite(entry['end']) ||
      entry['end'] <= entry['start'] ||
      entry['end'] > duration ||
      entry['start'] < (segments.at(-1)?.end ?? 0) ||
      (options.mode === 'transcribe' && 'originalText' in entry)
    )
      return null;
    const originalText =
      typeof entry['originalText'] === 'string' ? entry['originalText'] : entry['text'];
    totalText += entry['text'].length + originalText.length + 2;
    if (totalText > 100000) return null;
    segments.push({
      text: entry['text'],
      originalText,
      start: entry['start'],
      end: entry['end'],
    });
  }
  return { text: segments.map((entry) => entry.text).join(' '), segments };
}
