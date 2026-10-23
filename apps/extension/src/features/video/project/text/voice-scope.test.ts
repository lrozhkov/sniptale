import { afterEach, expect, it, vi } from 'vitest';
import { createSha256Digest } from '@sniptale/platform/security/digest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import type { VideoProjectTextDocument } from './types';
import { captureVideoProjectVoiceTextBasis, createVideoProjectTextAudioScope } from './voice-scope';

vi.mock('@sniptale/platform/security/digest', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/security/digest')>()),
  createSha256Digest: vi.fn(
    (await original<typeof import('@sniptale/platform/security/digest')>()).createSha256Digest
  ),
}));

afterEach(() => vi.clearAllMocks());

function fixture(source = false) {
  const project = createEmptyVideoProject('Speech');
  project.duration = 20;
  const asset = createVideoProjectAsset(
    'Silent video',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'silent' },
    {
      duration: 10,
      width: 640,
      height: 360,
      hasAudio: false,
      mimeType: 'video/webm',
      size: 1,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 2);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'instance';
  const entry: VideoProjectTextDocument = {
    id: 'script',
    binding: source
      ? { kind: 'source', assetId: asset.id, sourceInstanceId: 'instance' }
      : { kind: 'project' },
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Speak these words',
          originalText: 'Original words',
          revision: 2,
          timingRevision: 3,
          start: 1,
          end: 9,
          timeDomain: source ? 'source' : 'result',
          alignment: 'manual',
          showInVideo: true,
        },
      ],
    },
  };
  project.textDocuments = [entry];
  if (source) {
    project.assets = [asset];
    project.clips = [clip];
  }
  return { project, entry, fragment: entry.document.fragments[0]!, clip };
}

it('captures project-clock narration without media or source-byte authority', async () => {
  const { project, fragment } = fixture();
  const { scope, basis } = await createVideoProjectTextAudioScope(project, 4, 'script', 'phrase');
  expect(project.assets).toEqual([]);
  expect(project.clips).toEqual([]);
  expect(scope).toEqual({
    projectId: project.id,
    projectRevision: 4,
    projectUpdatedAt: project.updatedAt,
    target: { kind: 'project-text', documentId: 'script', fragmentId: 'phrase' },
    basisHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
  });
  expect(basis.fragment).toEqual(fragment);
  expect(basis.projection).toEqual({
    excludedFromResult: false,
    partiallyExcluded: false,
    ranges: [{ start: 1, end: 9 }],
  });
});

it('retains dormant and partially cut source text with exact disclosed ranges', async () => {
  const { project, clip } = fixture(true);
  project.clips = [];
  const dormant = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  expect(dormant.basis.projection).toEqual({
    excludedFromResult: true,
    partiallyExcluded: false,
    ranges: [],
  });
  project.clips = [{ ...clip, sourceDuration: 4, duration: 2, playbackRate: 2 }];
  const partial = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  expect(partial.basis.projection).toEqual({
    excludedFromResult: false,
    partiallyExcluded: true,
    ranges: [{ start: 2.5, end: 4 }],
  });
  expect(partial.basis.fragment).toEqual(dormant.basis.fragment);
  expect(partial.scope.basisHash).not.toBe(dormant.scope.basisHash);
});

it('preserves reordered, overlapping and repeated split placements at their speed', async () => {
  const { project, clip } = fixture(true);
  project.clips = [
    {
      ...clip,
      id: 'late',
      sourceStart: 5,
      sourceDuration: 5,
      duration: 2.5,
      playbackRate: 2,
      startTime: 0,
    },
    { ...clip, id: 'early', sourceDuration: 5, duration: 5, startTime: 1 },
    { ...clip, id: 'repeat', sourceDuration: 5, duration: 5, startTime: 1 },
    { ...clip, id: 'independent', sourceInstanceId: 'other', startTime: 12 },
  ];
  const captured = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  expect(captured.basis.projection).toEqual({
    excludedFromResult: false,
    partiallyExcluded: false,
    ranges: [
      { start: 0, end: 2 },
      { start: 2, end: 6 },
      { start: 2, end: 6 },
    ],
  });
  project.clips.reverse();
  const reordered = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  expect(reordered.scope.basisHash).toBe(captured.scope.basisHash);
  project.clips = project.clips.filter((item) => item.id !== 'repeat');
  expect(
    (await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase')).scope.basisHash
  ).not.toBe(captured.scope.basisHash);
});

it('distinguishes restored native slice order even when every project range stays the same', async () => {
  const { project, clip, fragment } = fixture(true);
  fragment.start = 0;
  fragment.end = 4;
  project.clips = [
    { ...clip, id: 'first', sourceStart: 0, sourceDuration: 2, duration: 2, startTime: 0 },
    { ...clip, id: 'second', sourceStart: 2, sourceDuration: 2, duration: 2, startTime: 2 },
  ];
  const original = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  project.clips = [
    { ...clip, id: 'first', sourceStart: 2, sourceDuration: 2, duration: 2, startTime: 0 },
    { ...clip, id: 'second', sourceStart: 0, sourceDuration: 2, duration: 2, startTime: 2 },
  ];
  const restored = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  expect(restored.basis.projection).toEqual(original.basis.projection);
  expect(restored.scope.basisHash).not.toBe(original.scope.basisHash);
});

it('detaches the complete basis and project timestamp before the digest awaits', async () => {
  const { project, entry, fragment } = fixture(true);
  const timestamp = project.updatedAt;
  const originalDigest = vi.mocked(createSha256Digest).getMockImplementation()!;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(createSha256Digest).mockImplementationOnce(async (value) => {
    await gate;
    return originalDigest(value);
  });
  const pending = createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  fragment.text = 'Changed while hashing';
  fragment.start = 3;
  entry.binding = { kind: 'project' };
  project.clips[0]!.startTime = 12;
  project.updatedAt++;
  release!();
  const result = await pending;
  expect(result.scope.projectUpdatedAt).toBe(timestamp);
  expect(result.basis.fragment.text).toBe('Speak these words');
  expect(result.basis.fragment.start).toBe(1);
  expect(result.basis.binding.kind).toBe('source');
  expect(result.basis.projection.ranges).toEqual([{ start: 3, end: 11 }]);
});

it.each(['text', 'timing', 'revision', 'binding', 'placement', 'creation', 'document'] as const)(
  'distinguishes same-tuple restored %s in the selected basis',
  async (change) => {
    const { project, entry, fragment, clip } = fixture(true);
    const before = await createVideoProjectTextAudioScope(project, 7, 'script', 'phrase');
    let documentId = 'script';
    switch (change) {
      case 'text':
        fragment.text = 'Restored words';
        break;
      case 'timing':
        fragment.end = 8;
        break;
      case 'revision':
        fragment.revision++;
        break;
      case 'binding':
        entry.binding = { kind: 'source', assetId: clip.assetId, sourceInstanceId: 'other' };
        break;
      case 'placement':
        clip.startTime++;
        break;
      case 'creation':
        project.createdAt++;
        break;
      case 'document':
        entry.id = documentId = 'other-document';
        break;
    }
    const restored = await createVideoProjectTextAudioScope(project, 7, documentId, 'phrase');
    expect(restored.scope.projectUpdatedAt).toBe(before.scope.projectUpdatedAt);
    expect(restored.scope.basisHash).not.toBe(before.scope.basisHash);
  }
);

it('keeps visual and provenance metadata detached but outside speech authority', async () => {
  const { project, fragment } = fixture();
  const before = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  fragment.showInVideo = false;
  fragment.alignment = 'range';
  fragment.originalText = 'Different provenance';
  fragment.origin = { kind: 'original', start: 0, end: 2 };
  fragment.style = { position: 'top', fontSize: 0.05, color: '#ffffff', background: '#000000' };
  const after = await createVideoProjectTextAudioScope(project, 1, 'script', 'phrase');
  expect(after.scope.basisHash).toBe(before.scope.basisHash);
  expect(after.basis.fragment).toEqual(fragment);
  fragment.origin.start = 1;
  expect(after.basis.fragment.origin?.start).toBe(0);
});

it('rejects missing, empty, oversized, malformed and conflicting clock selections', async () => {
  const { project, fragment } = fixture();
  await expect(createVideoProjectTextAudioScope(project, 1, 'absent', 'phrase')).rejects.toThrow(
    'stale'
  );
  await expect(createVideoProjectTextAudioScope(project, 1, 'script', 'absent')).rejects.toThrow(
    'stale'
  );
  fragment.text = ' ';
  await expect(createVideoProjectTextAudioScope(project, 1, 'script', 'phrase')).rejects.toThrow(
    'invalid-request'
  );
  fragment.text = 'x'.repeat(4097);
  await expect(createVideoProjectTextAudioScope(project, 1, 'script', 'phrase')).rejects.toThrow(
    'too-large'
  );
  fragment.text = 'Valid';
  fragment.timeDomain = 'source';
  await expect(createVideoProjectTextAudioScope(project, 1, 'script', 'phrase')).rejects.toThrow(
    'invalid-request'
  );
  fragment.timeDomain = 'result';
  await expect(createVideoProjectTextAudioScope(project, -1, 'script', 'phrase')).rejects.toThrow(
    'invalid-request'
  );
});

it('shares the exact AI basis hash with local text capture', async () => {
  const f = fixture(true);
  const local = await captureVideoProjectVoiceTextBasis(f.project, 'script', 'phrase');
  const ai = await createVideoProjectTextAudioScope(f.project, 1, 'script', 'phrase');
  expect(local.basis).toEqual(ai.basis);
  expect(local.basisHash).toBe(ai.scope.basisHash);
});

it('keeps the 4096 speech limit separate from the 16000 local snapshot bound', async () => {
  const f = fixture();
  f.fragment.text = 'x'.repeat(16000);
  await expect(
    captureVideoProjectVoiceTextBasis(f.project, 'script', 'phrase')
  ).resolves.toMatchObject({ basis: { fragment: { text: f.fragment.text } } });
  await expect(createVideoProjectTextAudioScope(f.project, 1, 'script', 'phrase')).rejects.toThrow(
    'too-large'
  );
  f.fragment.text += 'x';
  await expect(captureVideoProjectVoiceTextBasis(f.project, 'script', 'phrase')).rejects.toThrow(
    'invalid-request'
  );
});
