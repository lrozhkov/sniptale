import { expect, it } from 'vitest';
import { parseAudioJobClientMessage, parseAudioJobServerMessage } from './audio';
const scope = {
  workspaceId: 'w',
  workspaceRevision: 1,
  clipId: 'c',
  assetId: 'a',
  nativeStart: 0,
  nativeEnd: 1,
};
it('parses operation-scoped messages and rejects forged staging identity and profile', () => {
  expect(
    parseAudioJobClientMessage({
      type: 'start',
      requestId: 'r',
      modelId: 'm',
      scope,
      operation: 'transcription',
    })
  ).not.toBeNull();
  expect(
    parseAudioJobClientMessage({
      type: 'start',
      requestId: 'r',
      modelId: 'm',
      scope: { ...scope, nativeEnd: Infinity },
      operation: 'transcription',
    })
  ).toBeNull();
  expect(
    parseAudioJobClientMessage({
      type: 'execute',
      requestId: 'r',
      ticket: '../x',
      staged: { id: '../x', mimeType: 'audio/wav', size: 10 },
    })
  ).toBeNull();
  expect(
    parseAudioJobClientMessage({
      type: 'start',
      requestId: 'r',
      modelId: 'm',
      scope,
      operation: 'speech',
      phraseId: 'p',
      textRevision: 1,
      text: 'hello',
      profile: { voiceId: 'voice', responseFormat: 'mp3', apiKey: 'forged' },
    })
  ).toBeNull();
});
it('validates reply metadata and fixed failure codes', () => {
  expect(
    parseAudioJobServerMessage({ type: 'failure', requestId: 'r', code: 'provider-auth' })
  ).not.toBeNull();
  expect(
    parseAudioJobServerMessage({ type: 'failure', requestId: 'r', code: 'raw response text' })
  ).toBeNull();
  expect(
    parseAudioJobServerMessage({
      type: 'transcript',
      requestId: 'r',
      result: { text: 'a', words: [{ text: 'a', start: 1, end: 0 }] },
    })
  ).toBeNull();
});

it('rejects ASCII control characters in identifiers without excluding printable Unicode', () => {
  const start = { type: 'start', requestId: 'r', modelId: 'm', scope, operation: 'transcription' };
  for (let code = 0; code < 32; code += 1) {
    expect(
      parseAudioJobClientMessage({ ...start, requestId: `r${String.fromCharCode(code)}` })
    ).toBeNull();
  }
  expect(parseAudioJobClientMessage({ ...start, requestId: 'r Пример 🎤' })).not.toBeNull();
  expect(
    parseAudioJobClientMessage({ ...start, requestId: `r${String.fromCharCode(127)}` })
  ).not.toBeNull();
});
