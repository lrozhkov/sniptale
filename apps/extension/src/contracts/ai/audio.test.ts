import { expect, it } from 'vitest';
import {
  AUDIO_INPUT_MAX_SECONDS,
  parseAudioJobClientMessage,
  parseAudioJobServerMessage,
  parseAudioJobScope,
  parseReviewSpeechTarget,
  sameReviewSpeechTarget,
  sameAudioJobScope,
  parseAudioRecognitionOptions,
} from './audio';
const scope = {
  workspaceId: 'w',
  workspaceRevision: 1,
  target: { kind: 'voiceover' as const, clipId: 'c' },
  assetId: 'a',
  nativeStart: 0,
  nativeEnd: 1,
};

it('freezes bounded multimodal options at the Port boundary and rejects forged operation fields', () => {
  const recognition = { mode: 'rewrite', granularity: 'phrase', prompt: 'Make concise.' };
  const start = {
    type: 'start',
    requestId: 'r',
    modelId: 'm',
    approvedProviderId: 'provider',
    scope,
    operation: 'transcription',
    recognition,
  };
  const parsed = parseAudioJobClientMessage(start);
  expect(parseAudioJobClientMessage({ ...start, approvedProviderId: undefined })).toBeNull();
  expect(parsed).toMatchObject({ recognition });
  recognition.prompt = 'Changed later';
  expect(parsed).toMatchObject({ recognition: { prompt: 'Make concise.' } });
  for (const patch of [
    { mode: 'translate' },
    { granularity: 'word' },
    { prompt: 'x'.repeat(10001) },
    { prompt: 1 },
    { extra: true },
    { mode: 'transcribe', prompt: 'Rewrite' },
  ])
    expect(
      parseAudioJobClientMessage({ ...start, recognition: { ...recognition, ...patch } })
    ).toBeNull();
  expect(
    parseAudioRecognitionOptions({ mode: 'transcribe', granularity: 'paragraph', prompt: '' })
  ).not.toBeNull();
  expect(
    parseAudioJobClientMessage({
      ...start,
      operation: 'speech',
      phraseId: 'p',
      textRevision: 1,
      text: 'a',
      profile: { voiceId: 'v', responseFormat: 'mp3' },
    })
  ).toBeNull();
});

it('preserves bounded source wording only on transcript segment frames', () => {
  const segment = { text: 'Short.', originalText: 'Longer source.', start: 0, end: 1 };
  const frame = {
    type: 'transcript',
    requestId: 'r',
    result: { text: 'Short.', segments: [segment] },
  };
  expect(parseAudioJobServerMessage(frame)).toEqual(frame);
  expect(
    parseAudioJobServerMessage({ ...frame, result: { text: 'Short.', words: [segment] } })
  ).toBeNull();
  expect(
    parseAudioJobServerMessage({
      ...frame,
      result: { text: 'Short.', segments: [{ ...segment, originalText: 'x'.repeat(16001) }] },
    })
  ).toBeNull();
});

it('admits asset-free text synthesis and refuses text transcription, mixed clocks or forged identity', () => {
  const textScope = {
    workspaceId: 'w',
    workspaceRevision: 2,
    target: { kind: 'text' as const, fragmentId: 'text' },
    textRevision: 1,
    timingRevision: 3,
    start: 2,
    end: 5,
    timeDomain: 'result' as const,
  };
  const start = {
    type: 'start',
    requestId: 'r',
    modelId: 'voice',
    approvedProviderId: 'approved-provider',
    scope: textScope,
    operation: 'speech',
    phraseId: 'text',
    textRevision: 1,
    text: 'Hello',
    profile: { voiceId: 'alloy', responseFormat: 'mp3' },
  };
  expect(parseAudioJobScope(textScope)).toEqual(textScope);
  expect(parseAudioJobClientMessage(start)).toMatchObject({ scope: textScope });
  for (const responseFormat of ['mp3', 'wav', 'pcm']) {
    const message = { ...start, profile: { ...start.profile, responseFormat } };
    expect(parseAudioJobClientMessage(message)).toEqual(message);
  }
  expect(
    parseAudioJobServerMessage({
      type: 'audio',
      requestId: 'r',
      staged: { id: '12345678-1234-4234-8234-123456789abc', mimeType: 'audio/wav', size: 36044 },
    })
  ).not.toBeNull();
  expect(parseAudioJobClientMessage({ ...start, approvedProviderId: undefined })).toBeNull();
  expect(parseAudioJobClientMessage({ ...start, approvedProviderId: '' })).toBeNull();
  expect(
    parseAudioJobClientMessage({ ...start, approvedProviderId: { id: 'provider' } })
  ).toBeNull();
  expect(parseAudioJobClientMessage({ ...start, operation: 'transcription' })).toBeNull();
  expect(parseAudioJobClientMessage({ ...start, phraseId: 'another' })).toBeNull();
  expect(parseAudioJobClientMessage({ ...start, textRevision: 2 })).toBeNull();
  for (const patch of [
    { assetId: 'fake' },
    { nativeStart: 0 },
    { end: Infinity },
    { timeDomain: 'native' },
    { timingRevision: -1 },
  ])
    expect(parseAudioJobScope({ ...textScope, ...patch })).toBeNull();
  expect(sameAudioJobScope(textScope, textScope)).toBe(true);
  expect(sameAudioJobScope(textScope, { ...textScope, timingRevision: 4 })).toBe(false);
  expect(sameAudioJobScope(textScope, scope)).toBe(false);
  expect(sameAudioJobScope(scope, textScope)).toBe(false);
});
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

it.each([
  'network-failed',
  'provider-request',
  'provider-not-found',
  'secret-unavailable',
  'decode-failed',
] as const)('accepts the fixed diagnostic code %s across the audio Port', (code) => {
  expect(parseAudioJobServerMessage({ type: 'failure', requestId: 'r', code })).toEqual({
    type: 'failure',
    requestId: 'r',
    code,
  });
  expect(
    parseAudioJobServerMessage({
      type: 'failure',
      requestId: 'r',
      code: `${code}: private provider body`,
    })
  ).toBeNull();
});

it('binds both strict target variants across scope parsing and equality', () => {
  const original = { ...scope, target: { kind: 'original' as const } };
  expect(parseAudioJobScope(original)).toEqual(original);
  expect(sameAudioJobScope(original, original)).toBe(true);
  expect(sameAudioJobScope(original, scope)).toBe(false);
  expect(sameReviewSpeechTarget(scope.target, { kind: 'voiceover', clipId: 'other' })).toBe(false);
  for (const target of [
    null,
    {},
    { kind: 'music' },
    { kind: 'voiceover' },
    { kind: 'original', clipId: 'c' },
    { kind: 'original', extra: true },
    { kind: 'voiceover', clipId: 'c', extra: true },
  ]) {
    expect(parseReviewSpeechTarget(target)).toBeNull();
    expect(parseAudioJobScope({ ...scope, target })).toBeNull();
  }
  expect(parseAudioJobScope({ ...original, clipId: 'legacy' })).toBeNull();
  expect(
    parseAudioJobServerMessage({
      type: 'authorized',
      requestId: 'r',
      ticket: '12345678-1234-4234-8234-123456789abc',
      scope: original,
    })
  ).toMatchObject({ scope: original });
});
it('admits bounded request keepalive without admitting new work or malformed identity', () => {
  expect(parseAudioJobClientMessage({ type: 'keepalive', requestId: 'r' })).toEqual({
    type: 'keepalive',
    requestId: 'r',
  });
  expect(parseAudioJobClientMessage({ type: 'keepalive', requestId: '' })).toBeNull();
  expect(parseAudioJobClientMessage({ type: 'keepalive', requestId: 'r\nsecret' })).toBeNull();
});

it('admits source and returned timings longer than five minutes within the upload budget', () => {
  expect(parseAudioJobScope({ ...scope, nativeEnd: 330.425 })).not.toBeNull();
  expect(
    parseAudioJobServerMessage({
      type: 'transcript',
      requestId: 'r',
      result: { text: 'Last.', segments: [{ text: 'Last.', start: 329, end: 330 }] },
    })
  ).not.toBeNull();
});

it('admits disclosed project transcription without admitting project speech or mixed owner scopes', () => {
  const projectScope = {
    projectId: 'project',
    projectRevision: 4,
    projectUpdatedAt: 10,
    target: { kind: 'project-clip' as const, clipId: 'clip' },
    assetId: 'asset',
    nativeStart: 2,
    nativeEnd: 4,
  };
  const request = {
    type: 'start',
    requestId: 'project-request',
    operation: 'transcription',
    modelId: 'model',
    approvedProviderId: 'provider',
    scope: projectScope,
  };
  expect(parseAudioJobClientMessage(request)).toEqual(request);
  expect(parseAudioJobScope(projectScope)).toEqual(projectScope);
  expect(parseAudioJobClientMessage({ ...request, approvedProviderId: undefined })).toBeNull();
  expect(
    parseAudioJobClientMessage({
      ...request,
      operation: 'speech',
      phraseId: 'phrase',
      textRevision: 0,
      text: 'Text',
      profile: { voiceId: 'voice', responseFormat: 'mp3' },
    })
  ).toBeNull();
  for (const patch of [
    { projectId: '' },
    { projectRevision: -1 },
    { projectRevision: 0.5 },
    { projectUpdatedAt: NaN },
    { projectUpdatedAt: -1 },
    { assetId: '' },
    { nativeStart: -1 },
    { nativeEnd: Infinity },
    { nativeEnd: 2 },
    { nativeEnd: 100000 },
    { target: { kind: 'project-clip', clipId: '' } },
    { target: { kind: 'project-clip', clipId: 'clip', extra: 'mixed' } },
    { workspaceId: 'workspace' },
    { extra: true },
  ])
    expect(parseAudioJobScope({ ...projectScope, ...patch })).toBeNull();
  expect(parseAudioJobScope({ ...scope, projectId: 'project' })).toBeNull();
  expect(sameAudioJobScope(projectScope, structuredClone(projectScope))).toBe(true);
  for (const changed of [
    { ...projectScope, projectId: 'other' },
    { ...projectScope, projectRevision: 5 },
    { ...projectScope, projectUpdatedAt: 11 },
    { ...projectScope, target: { kind: 'project-clip' as const, clipId: 'other' } },
    { ...projectScope, assetId: 'other' },
    { ...projectScope, nativeStart: 3 },
    { ...projectScope, nativeEnd: 5 },
    scope,
  ]) {
    expect(sameAudioJobScope(projectScope, changed)).toBe(false);
    expect(sameAudioJobScope(changed, projectScope)).toBe(false);
  }
  const authorized = {
    type: 'authorized',
    requestId: 'project-request',
    ticket: '12345678-1234-4234-8234-123456789abc',
    scope: projectScope,
  };
  expect(parseAudioJobServerMessage(authorized)).toEqual(authorized);
});

it('admits maximum native chunks at late offsets without admitting one extra PCM sample', () => {
  const nativeStart = 10000;
  const nativeEnd = nativeStart + AUDIO_INPUT_MAX_SECONDS;
  const scopes = [
    { ...scope, nativeStart, nativeEnd },
    {
      projectId: 'project',
      projectRevision: 1,
      projectUpdatedAt: 1,
      target: { kind: 'project-clip', clipId: 'clip' },
      assetId: 'asset',
      nativeStart,
      nativeEnd,
    },
  ];
  expect(nativeEnd - nativeStart).toBeGreaterThan(AUDIO_INPUT_MAX_SECONDS);
  for (const candidate of scopes) {
    expect(parseAudioJobScope(candidate)).toEqual(candidate);
    expect(parseAudioJobScope({ ...candidate, nativeEnd: nativeEnd + 1 / 16000 })).toBeNull();
  }
});
