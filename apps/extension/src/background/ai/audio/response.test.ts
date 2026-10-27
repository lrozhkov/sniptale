import { describe, expect, it } from 'vitest';
import { parseAudioTranscriptResponse, validateAudioUpload } from './response';

describe('audio response boundary', () => {
  it('preserves repeated words, silence and explicit text-only output', () => {
    expect(parseAudioTranscriptResponse({ text: '' }, 2)).toEqual({ text: '' });
    expect(
      parseAudioTranscriptResponse(
        {
          text: 'yes yes',
          words: [
            { word: 'yes', start: 0, end: 0.5 },
            { word: 'yes', start: 0.5, end: 1 },
          ],
        },
        2
      )?.words
    ).toHaveLength(2);
  });
  it.each([
    { text: 'a', words: [{ word: 'a', start: 0, end: 4 }] },
    {
      text: 'a',
      words: [
        { word: 'a', start: 0, end: 1 },
        { word: 'a', start: 0.8, end: 2 },
      ],
    },
    { text: 'a', segments: [{ text: 'a', start: Number.NaN, end: 1 }] },
    { text: 'a', words: 'invalid' },
  ])('rejects malformed supplied alignment', (value) => {
    expect(parseAudioTranscriptResponse(value, 2)).toBeNull();
  });
  it('keeps complete text and valid segments when a word has no duration', () => {
    const segments = [{ text: 'one two', start: 0, end: 1 }];
    expect(
      parseAudioTranscriptResponse(
        {
          text: 'one two',
          segments,
          words: [
            { word: 'one', start: 0, end: 0.5 },
            { word: 'two', start: 0.5, end: 0.5 },
          ],
        },
        2
      )
    ).toEqual({
      text: 'one two',
      segments,
      words: [
        { text: 'one', start: 0, end: 0.5 },
        { text: 'two', start: 0.5, end: 0.5 },
      ],
    });
    expect(
      parseAudioTranscriptResponse(
        {
          text: 'two',
          words: [{ word: 'two', start: 2, end: 2 }],
        },
        2
      )
    ).toEqual({ text: 'two', words: [{ text: 'two', start: 2, end: 2 }] });
  });
  it.each([
    [{ word: 'a', start: 1, end: 0.5 }],
    [{ word: 'a', start: 3, end: 3 }],
    [
      { word: 'a', start: 1, end: 1 },
      { word: 'b', start: 0, end: 0.5 },
    ],
    [
      { word: 'a', start: 1, end: 1 },
      { word: 'b', start: 1, end: Number.NaN },
    ],
  ])('still rejects invalid alignment alongside zero duration: %j', (...words) => {
    expect(parseAudioTranscriptResponse({ text: 'a b', words }, 2)).toBeNull();
  });
  it('checks WAV duration against the authorized native range', async () => {
    const bytes = new Uint8Array(32044);
    const view = new DataView(bytes.buffer);
    const put = (offset: number, text: string) => bytes.set(new TextEncoder().encode(text), offset);
    put(0, 'RIFF');
    put(8, 'WAVE');
    put(12, 'fmt ');
    put(36, 'data');
    view.setUint32(4, 32036, true);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(40, 32000, true);
    const file = new Blob([bytes], { type: 'audio/wav' });
    expect(await validateAudioUpload(file, 1)).toBe(true);
    expect(await validateAudioUpload(file, 2)).toBe(false);
    view.setUint16(22, 2, true);
    expect(await validateAudioUpload(new Blob([bytes], { type: 'audio/wav' }), 1)).toBe(false);
  });
});

it('treats nullable timing arrays as absent while preserving valid fallback', () => {
  const segments = [{ text: 'hello', start: 0, end: 1 }];
  const words = [{ word: 'hello', start: 0.1, end: 0.9 }];
  expect(parseAudioTranscriptResponse({ text: 'hello', words: null, segments }, 1)).toEqual({
    text: 'hello',
    segments,
  });
  expect(parseAudioTranscriptResponse({ text: 'hello', segments: null, words }, 1)).toEqual({
    text: 'hello',
    words: [{ text: 'hello', start: 0.1, end: 0.9 }],
  });
  expect(parseAudioTranscriptResponse({ text: 'hello', words: null, segments: null }, 1)).toEqual({
    text: 'hello',
  });
  expect(
    parseAudioTranscriptResponse({ text: 'hello', words: false, segments: null }, 1)
  ).toBeNull();
  expect(
    parseAudioTranscriptResponse(
      { text: 'hello', words: null, segments: [{ text: 'hello', start: 0, end: 1.027 }] },
      1
    )
  ).toBeNull();
});
