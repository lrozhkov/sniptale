import { VOICE_INPUT_TRANSCRIPT_MAX_CHARS } from './types';
import { expect, it } from 'vitest';
import {
  parseVoiceCaptureToken,
  parseVoiceHistoryEntry,
  parseVoiceInputHistoryScope,
} from './history';

const scope = {
  entryId: 'entry',
  incarnation: 'first',
  epoch: 'epoch',
  revision: 1,
  audioDigest: `sha256:${'a'.repeat(64)}`,
};
const entry = {
  ...scope,
  sequence: 1,
  createdAt: 0,
  backend: 'model',
  language: 'en-US',
  durationSeconds: 1,
  byteLength: 5,
  mimeType: 'audio/wav',
  rawTranscript: null,
  transcript: null,
  status: 'recorded',
  correctionStatus: 'off',
  failureCode: null,
};

it('admits the exact bounded scope capture token and history DTO', () => {
  expect(parseVoiceInputHistoryScope(scope)).toEqual(scope);
  expect(
    parseVoiceCaptureToken({
      entryId: 'entry',
      incarnation: 'first',
      epoch: 'epoch',
      sequence: 1,
      createdAt: 0,
    })
  ).not.toBeNull();
  expect(parseVoiceHistoryEntry(entry)).toEqual(entry);
});

it('rejects filesystem traversal unknown fields and invalid revision bindings', () => {
  expect(parseVoiceInputHistoryScope({ ...scope, entryId: '../secret' })).toBeNull();
  expect(parseVoiceInputHistoryScope({ ...scope, revision: 0 })).toBeNull();
  expect(parseVoiceInputHistoryScope({ ...scope, epoch: undefined })).toBeNull();
  expect(parseVoiceInputHistoryScope({ ...scope, audioDigest: 'unverified' })).toBeNull();
  expect(parseVoiceHistoryEntry({ ...entry, providerSecret: 'secret' })).toBeNull();
  expect(
    parseVoiceHistoryEntry({
      ...entry,
      transcript: 'x'.repeat(VOICE_INPUT_TRANSCRIPT_MAX_CHARS + 1),
    })
  ).toBeNull();
  expect(parseVoiceHistoryEntry({ ...entry, failureCode: 'provider body' })).toBeNull();
  expect(parseVoiceHistoryEntry({ ...entry, mimeType: 'text/html' })).toBeNull();
});

it('strictly parses bounded settings history commands and metadata responses', async () => {
  const { parseVoiceHistoryRequest, parseVoiceHistoryServerEvent } = await import('./history');
  for (const request of [
    { type: 'list', requestId: 'request' },
    { type: 'retry', requestId: 'request', scope },
    { type: 'delete', requestId: 'request', scope },
  ])
    expect(parseVoiceHistoryRequest(request)).toEqual(request);
  for (const event of [
    { type: 'list', requestId: 'request', entries: [entry] },
    { type: 'entry', requestId: 'request', entry },
    { type: 'deleted', requestId: 'request', scope },
    { type: 'progress', requestId: 'request', scope, phase: 'processing-asr' },
    { type: 'progress', requestId: 'request', scope, phase: 'processing-text' },
    { type: 'failure', requestId: 'request', code: 'stale' },
  ])
    expect(parseVoiceHistoryServerEvent(event)).toEqual(event);
  expect(
    parseVoiceHistoryRequest({ type: 'retry', requestId: 'request', scope: entry })
  ).toBeNull();
  expect(parseVoiceHistoryRequest({ type: 'list', requestId: 'x'.repeat(129) })).toBeNull();
  expect(
    parseVoiceHistoryRequest({ type: 'list', requestId: 'request', path: '/private' })
  ).toBeNull();
  expect(
    parseVoiceHistoryServerEvent({
      type: 'list',
      requestId: 'request',
      entries: Array.from({ length: 21 }, () => entry),
    })
  ).toBeNull();
  expect(
    parseVoiceHistoryServerEvent({ type: 'list', requestId: 'request', entries: [entry, entry] })
  ).toBeNull();
  expect(
    parseVoiceHistoryServerEvent({ type: 'entry', requestId: 'request', entry, audio: 'bytes' })
  ).toBeNull();
  expect(
    parseVoiceHistoryServerEvent({ type: 'failure', requestId: 'request', code: 'provider body' })
  ).toBeNull();
  expect(
    parseVoiceHistoryServerEvent({
      type: 'progress',
      requestId: 'request',
      scope,
      phase: 'listening',
    })
  ).toBeNull();
});
