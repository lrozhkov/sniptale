import { expect, it } from 'vitest';
import {
  isAudioSourceJobScope,
  isProjectAudioJobScope,
  isProjectAudioTextJobScope,
  parseAudioJobClientMessage,
  parseAudioJobScope,
  sameAudioJobScope,
  type ProjectAudioTextJobScope,
} from './audio';

const scope: ProjectAudioTextJobScope = {
  projectId: 'project',
  projectRevision: 3,
  projectUpdatedAt: 10,
  target: { kind: 'project-text', documentId: 'document', fragmentId: 'phrase' },
  basisHash: `sha256:${'a'.repeat(64)}`,
};
const request = {
  type: 'start',
  operation: 'speech',
  requestId: 'request',
  modelId: 'model',
  approvedProviderId: 'provider',
  scope,
  phraseId: 'phrase',
  textRevision: 0,
  text: 'Authored words without any source audio.',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};

it('admits disclosed montage text speech without granting source audio or transcription', () => {
  expect(parseAudioJobScope(scope)).toEqual(scope);
  expect(parseAudioJobClientMessage(request)).toEqual(request);
  expect(isAudioSourceJobScope(scope)).toBe(false);
  expect(isProjectAudioJobScope(scope)).toBe(true);
  expect(isProjectAudioTextJobScope(scope)).toBe(true);
  for (const patch of [
    { operation: 'transcription' },
    { approvedProviderId: undefined },
    { phraseId: 'other' },
    { textRevision: -1 },
    { text: ' ' },
    { text: 'a'.repeat(4097) },
    { recognition: { mode: 'transcribe', granularity: 'phrase', prompt: '' } },
  ])
    expect(parseAudioJobClientMessage({ ...request, ...patch })).toBeNull();
});

it('refuses mixed authority, malformed identity and an unbounded or invalid basis hash', () => {
  for (const patch of [
    { projectId: '' },
    { projectRevision: 1.5 },
    { projectRevision: -1 },
    { projectUpdatedAt: Infinity },
    { projectUpdatedAt: -1 },
    { workspaceId: 'workspace' },
    { workspaceRevision: 1 },
    { assetId: 'asset' },
    { nativeStart: 0 },
    { nativeEnd: 1 },
    { text: 'unexpected retained payload' },
    { basisHash: 'a'.repeat(64) },
    { basisHash: `sha256:${'g'.repeat(64)}` },
    { basisHash: `sha256:${'a'.repeat(65)}` },
    { target: { ...scope.target, documentId: '' } },
    { target: { ...scope.target, fragmentId: '' } },
    { target: { ...scope.target, clipId: 'clip' } },
    { target: { ...scope.target, kind: 'text' } },
  ])
    expect(parseAudioJobScope({ ...scope, ...patch })).toBeNull();
});

it('binds staging equality to the project, document, phrase and exact selected basis', () => {
  expect(sameAudioJobScope(scope, structuredClone(scope))).toBe(true);
  const changed: ProjectAudioTextJobScope[] = [
    { ...scope, projectId: 'other' },
    { ...scope, projectRevision: 4 },
    { ...scope, projectUpdatedAt: 11 },
    { ...scope, target: { ...scope.target, documentId: 'other' } },
    { ...scope, target: { ...scope.target, fragmentId: 'other' } },
    { ...scope, basisHash: `sha256:${'b'.repeat(64)}` },
  ];
  for (const candidate of changed) {
    expect(sameAudioJobScope(scope, candidate)).toBe(false);
    expect(sameAudioJobScope(candidate, scope)).toBe(false);
  }
  const gallery = {
    workspaceId: 'project',
    workspaceRevision: 3,
    target: { kind: 'text' as const, fragmentId: 'phrase' },
    textRevision: 0,
    timingRevision: 0,
    start: 0,
    end: 1,
    timeDomain: 'result' as const,
  };
  expect(sameAudioJobScope(scope, gallery)).toBe(false);
  expect(sameAudioJobScope(gallery, scope)).toBe(false);
});
