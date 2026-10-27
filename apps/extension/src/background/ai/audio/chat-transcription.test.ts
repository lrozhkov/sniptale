import { describe, expect, it } from 'vitest';
import {
  buildChatTranscriptionCall,
  transformBothubChatRequest,
  parseChatTranscription,
} from './chat-transcription';
import type { AudioRecognitionOptions } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';
const options: AudioRecognitionOptions = {
  mode: 'transcribe',
  granularity: 'sentence',
  prompt: '',
};
const config: AudioModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://provider.test/v1/chat/completions',
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
  it('builds SDK audio parts and a fixed schema without credentials in the payload', () => {
    const bytes = new Uint8Array([97, 98, 99]);
    const call = buildChatTranscriptionCall(config, options, 10, bytes);
    expect(call.prompt[1]).toMatchObject({
      role: 'user',
      content: [
        expect.anything(),
        { type: 'file', data: { type: 'data', data: bytes }, mediaType: 'audio/wav' },
      ],
    });
    expect(call.responseFormat).toMatchObject({
      type: 'json',
      name: 'timed_transcript',
      schema: { type: 'object' },
    });
    expect(call.prompt[0]).toMatchObject({ content: expect.stringContaining('User instructions') });
    expect(call.prompt[0]).toMatchObject({ content: expect.stringContaining('verbatim') });
    expect(call.prompt[0]).toMatchObject({
      content: expect.stringContaining('Audio-relative duration: 10'),
    });
    expect(call).not.toHaveProperty('apiKey');
  });
  it('retains rewrite instructions and explicitly selected JSON Object mode', () => {
    const call = buildChatTranscriptionCall(
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
      new Uint8Array([97])
    );
    expect(call.responseFormat).toEqual({ type: 'json' });
    expect(call.prompt[0]).toMatchObject({ content: expect.stringContaining('Make concise') });
  });
  it('refuses malformed SDK audio fields before Bothub egress', () => {
    expect(() =>
      transformBothubChatRequest({
        messages: [
          { content: [{ type: 'input_audio', input_audio: { format: 'mp3', data: 'YWJj' } }] },
        ],
      })
    ).toThrow('invalid-request');
    expect(() => transformBothubChatRequest({})).toThrow('invalid-request');
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
