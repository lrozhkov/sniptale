import { describe, expect, it } from 'vitest';
import { encodeChatTranscription, parseChatTranscription } from './chat-transcription';
import type { AudioRecognitionOptions } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';
const options: AudioRecognitionOptions = {
  mode: 'transcribe',
  granularity: 'sentence',
  prompt: '',
};
const config: AudioModelConfig = {
  url: 'https://provider.test/v1/chat/completions',
  apiKey: 'unused',
  modelCode: 'declared',
  transcriptionInstructions: 'User instructions',
  transcription: {
    transport: 'audio-chat',
    chatProtocol: 'openai',
    structuredOutput: 'json_schema',
    responseFormat: 'json',
    timestampGranularity: 'none',
  },
};
const segment = { text: 'Первая фраза.', start: 2, end: 4 };
function response(segments: unknown, finish = 'stop') {
  return {
    choices: [{ finish_reason: finish, message: { content: JSON.stringify({ segments }) } }],
  };
}

describe('declared multimodal audio protocol', () => {
  it('encodes standard audio and a fixed schema without credentials in the payload', () => {
    const body = JSON.parse(encodeChatTranscription(config, options, 10, 'YWJj'));
    expect(body.messages[1].content[1]).toEqual({
      type: 'input_audio',
      input_audio: { data: 'YWJj', format: 'wav' },
    });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0].content).toContain('User instructions');
    expect(body.messages[0].content).toContain('verbatim');
    expect(body.messages[0].content).toContain('Audio-relative duration: 10');
    expect(body).not.toHaveProperty('apiKey');
  });
  it('uses the explicitly selected Bothub media protocol and JSON Object without transport fallback', () => {
    const body = JSON.parse(
      encodeChatTranscription(
        {
          ...config,
          transcription: {
            ...config.transcription!,
            chatProtocol: 'bothub',
            structuredOutput: 'json_object',
          },
        },
        { ...options, mode: 'rewrite', prompt: 'Make concise' },
        10,
        'YWJj'
      )
    );
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:audio/wav;base64,YWJj' },
    });
    expect(body.responseFormat).toEqual({ type: 'json_object' });
    expect(body).not.toHaveProperty('response_format');
    expect(body.messages[0].content).toContain('Make concise');
  });
  it('preserves native gaps and distinct verbatim text in correction mode', () => {
    const corrected = { ...segment, text: 'Коротко.', originalText: 'Первая фраза.' };
    expect(
      parseChatTranscription(response([corrected]), 10, { ...options, mode: 'rewrite' })
    ).toEqual({ text: 'Коротко.', segments: [corrected] });
    expect(parseChatTranscription(response([corrected]), 10, options)).toBeNull();
    expect(parseChatTranscription(response([]), 10, options)).toEqual({ text: '', segments: [] });
  });
  it.each(
    [
      [{ ...segment, start: -1 }],
      [{ ...segment, end: 11 }],
      [{ ...segment, end: 2 }],
      [{ ...segment, text: '' }],
      [{ ...segment, originalText: 'x'.repeat(16001) }],
      [{ ...segment, unexpected: true }],
      [segment, { ...segment, start: 3, end: 5 }],
    ].map((segments) => ({ segments }))
  )('rejects malformed, overlapping or unbounded model segments $segments', ({ segments }) => {
    expect(parseChatTranscription(response(segments), 10, options)).toBeNull();
  });
  it('admits pure transcript text once and copies it to local provenance', () => {
    expect(parseChatTranscription(response([segment]), 10, options)).toEqual({
      text: segment.text,
      segments: [{ ...segment, originalText: segment.text }],
    });
  });
  it('bounds verbatim provenance separately in correction mode', () => {
    expect(
      parseChatTranscription(response([{ ...segment, originalText: 'x'.repeat(16001) }]), 10, {
        ...options,
        mode: 'rewrite',
      })
    ).toBeNull();
  });
  it('rejects truncation, refusal and malformed JSON even when HTTP succeeded', () => {
    expect(parseChatTranscription(response([segment], 'length'), 10, options)).toBeNull();
    expect(
      parseChatTranscription(
        {
          choices: [
            { finish_reason: 'stop', message: { refusal: 'no', content: '{"segments":[]}' } },
          ],
        },
        10,
        options
      )
    ).toBeNull();
    expect(
      parseChatTranscription(
        { choices: [{ finish_reason: 'stop', message: { content: '{"segments":[' } }] },
        10,
        options
      )
    ).toBeNull();
  });
});
