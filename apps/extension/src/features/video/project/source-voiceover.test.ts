import { createAudioClipFromAsset } from './factories/clip';
import { reviewSpeechTextSignature } from '../review/speech-transcript';
import { expect, it } from 'vitest';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from './factories/creation';
import { buildReviewTimeMap } from '../review/timeline';
import { parseReviewAudioClip } from '../review/audio-clip-validation';
import { parseHydratableVideoProject, isExportReadyVideoProject } from './validation/root';
import { applyVideoProjectMutationPatch } from './mutation';
import {
  parseVideoProjectSourceVoiceoverDocuments,
  addProjectSourceVoiceoverDocument,
  applyProjectSourceVoiceoverEdit,
  duplicateProjectSourceVoiceoverDocuments,
  type VideoProjectSourceVoiceoverDocument,
} from './source-voiceover';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source');
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const audio = createVideoProjectAsset(
    'Voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice-bytes' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  project.tracks.push(track);
  project.assets.push(audio);
  const document: VideoProjectSourceVoiceoverDocument = {
    id: 'document',
    trackId: track.id,
    binding: {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
    enabled: false,
    originalAudioMuteVolume: 0.25,
    reference: buildReviewTimeMap(8, []),
    take: {
      id: 'take',
      assetId: audio.id,
      timelineStart: 1,
      sourceOffset: 0.5,
      duration: 4,
      volume: 1.5,
      muted: true,
      fadeIn: 0.25,
      fadeOut: 0.5,
      tempo: 0.5,
      sourceAnchor: [
        { start: 1, end: 2, offset: 0, duration: 1 },
        { start: 4, end: 7, offset: 1, duration: 3 },
      ],
      transcript: { version: 1, phrases: [], replacements: [] },
      textSnapshot: {
        kind: 'microphone',
        textId: 'text',
        revision: 0,
        timingRevision: 0,
        text: 'Accepted script',
        start: 1,
        end: 7,
        timeDomain: 'source',
      },
    },
  };
  return { project, clip, audio, track, document };
}

it('fences whole source voice takes at schema 31 without changing old documents', () => {
  const { project, document } = fixture();
  const before = structuredClone(project);
  for (let version = 2; version <= 30; version++) {
    expect(parseHydratableVideoProject({ ...project, version })).not.toBeNull();
    expect(
      parseHydratableVideoProject({ ...project, version, sourceVoiceoverDocuments: [] })
    ).toBeNull();
  }
  const changed = applyVideoProjectMutationPatch(project, { sourceVoiceoverDocuments: [document] });
  expect(changed.version).toBe(31);
  expect(isExportReadyVideoProject(changed)).toBe(true);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  expect(parseHydratableVideoProject({ ...changed, version: 40 })).not.toBeNull();
  expect(parseHydratableVideoProject({ ...changed, version: 46 })).toBeNull();
  expect(applyVideoProjectMutationPatch(changed, { sourceVoiceoverDocuments: [] }).version).toBe(
    31
  );
  expect(project).toEqual(before);
});

it('retains complete disabled, dormant and cut-hidden content through the shared take parser', () => {
  const { project, document } = fixture();
  document.take.dormant = true;
  const before = structuredClone(document);
  expect(parseReviewAudioClip(document.take)).toEqual(document.take);
  expect(parseVideoProjectSourceVoiceoverDocuments([document])).toEqual([document]);
  project.clips = [];
  const changed = applyVideoProjectMutationPatch(project, { sourceVoiceoverDocuments: [document] });
  expect(isExportReadyVideoProject(changed)).toBe(true);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))?.sourceVoiceoverDocuments
  ).toEqual([before]);
  delete document.take.sourceAnchor;
  expect(parseVideoProjectSourceVoiceoverDocuments([document])).toEqual([document]);
  document.take.dormant = false;
  expect(parseVideoProjectSourceVoiceoverDocuments([document])).toBeNull();
});

it.each([
  'derived-rate',
  'derived-phase',
  'unknown',
  'dormant',
  'nonfinite',
  'anchor',
  'reference-gap',
  'reference-rate',
  'enabled',
  'binding',
  'volume',
  'extra-document',
])('refuses malformed source voice field %s without altering the input', (field) => {
  const input = structuredClone(fixture().document);
  // JSON boundary mutations deliberately bypass authored TypeScript contracts.
  if (field === 'derived-rate') Reflect.set(input.take, 'playbackRate', 1);
  if (field === 'derived-phase') Reflect.set(input.take, 'fadePhase', { offset: 0, duration: 4 });
  if (field === 'unknown') Reflect.set(input.take, 'unknown', true);
  if (field === 'dormant') Reflect.set(input.take, 'dormant', 'yes');
  if (field === 'nonfinite') Reflect.set(input.take, 'volume', NaN);
  if (field === 'anchor')
    Reflect.set(input.take, 'sourceAnchor', [{ start: 1, end: 2, offset: 1, duration: 4 }]);
  if (field === 'reference-gap')
    Reflect.set(input, 'reference', [
      { kind: 'keep', sourceStart: 1, sourceEnd: 8, resultStart: 0, resultEnd: 7, rate: 1 },
    ]);
  if (field === 'reference-rate')
    Reflect.set(input, 'reference', [
      { kind: 'speed', sourceStart: 0, sourceEnd: 8, resultStart: 0, resultEnd: 8, rate: 0 },
    ]);
  if (field === 'enabled') Reflect.set(input, 'enabled', 1);
  if (field === 'binding') Reflect.set(input, 'binding', { kind: 'project' });
  if (field === 'volume') Reflect.set(input, 'originalAudioMuteVolume', 1.01);
  if (field === 'extra-document') Reflect.set(input, 'resourceLease', 'forged');
  const before = structuredClone(input);
  expect(parseVideoProjectSourceVoiceoverDocuments([input])).toBeNull();
  expect(input).toEqual(before);
});

it('refuses duplicate document or take identities and bounded-array overruns', () => {
  const { document } = fixture();
  expect(parseVideoProjectSourceVoiceoverDocuments([document, document])).toBeNull();
  expect(
    parseVideoProjectSourceVoiceoverDocuments([document, { ...document, id: 'different' }])
  ).toBeNull();
  expect(parseVideoProjectSourceVoiceoverDocuments(Array(513).fill(document))).toBeNull();
  expect(parseVideoProjectSourceVoiceoverDocuments(null)).toBeNull();
});

it.each([
  'source',
  'take',
  'track',
  'wrong-track',
  'conflicting-instance',
  'source-end',
  'audio-end',
])('refuses invalid resource reference %s while retaining hydratable authored state', (failure) => {
  const { project, clip, audio, track, document } = fixture();
  project.version = 31;
  project.sourceVoiceoverDocuments = [document];
  if (failure === 'source') project.assets = [audio];
  if (failure === 'take') project.assets = project.assets.filter((asset) => asset.id !== audio.id);
  if (failure === 'track') project.tracks = project.tracks.filter((item) => item.id !== track.id);
  if (failure === 'wrong-track') document.trackId = clip.trackId;
  if (failure === 'conflicting-instance') clip.assetId = audio.id;
  if (failure === 'source-end')
    document.reference[0]!.sourceEnd = document.reference[0]!.resultEnd = 9;
  if (failure === 'audio-end') document.take.sourceOffset = 5;
  expect(parseHydratableVideoProject(project)).not.toBeNull();
  expect(isExportReadyVideoProject(project)).toBe(false);
});

it('uses only arithmetic roundoff tolerance for native audio boundaries', () => {
  const { project, document, audio } = fixture();
  document.take.sourceOffset = 0.1;
  document.take.duration = 0.2;
  document.take.timelineStart = 0;
  document.take.sourceAnchor = [{ start: 0, end: 0.2, offset: 0, duration: 0.2 }];
  audio.metadata.duration = 0.3;
  project.version = 31;
  project.sourceVoiceoverDocuments = [document];
  expect(isExportReadyVideoProject(project)).toBe(true);
  document.take.sourceOffset += 1e-6;
  expect(isExportReadyVideoProject(project)).toBe(false);
});

it('rejects stale, invalid and locked edits and retries against the exact accepted take', () => {
  const { project, document, track, clip } = fixture();
  const added = addProjectSourceVoiceoverDocument(project, document);
  if (!added.ok || !added.document) throw new Error('Expected accepted take');
  const basis = added.document;
  const before = structuredClone(added.project);
  expect(
    applyProjectSourceVoiceoverEdit(added.project, structuredClone(basis), { enabled: true })
  ).toEqual({ ok: false, reason: 'stale' });
  expect(
    applyProjectSourceVoiceoverEdit(added.project, basis, { take: { ...basis.take, volume: NaN } })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    applyProjectSourceVoiceoverEdit(added.project, basis, {
      take: { ...basis.take, id: 'replacement' },
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  for (const trackId of [track.id, clip.trackId]) {
    const locked = {
      ...added.project,
      tracks: added.project.tracks.map((item) =>
        item.id === trackId ? { ...item, locked: true } : item
      ),
    };
    expect(applyProjectSourceVoiceoverEdit(locked, basis, { enabled: true })).toEqual({
      ok: false,
      reason: 'locked',
    });
  }
  expect(added.project).toEqual(before);
  const patch = { enabled: true, reference: [], binding: { kind: 'project' } };
  const changed = applyProjectSourceVoiceoverEdit(added.project, basis, patch);
  if (!changed.ok || !changed.document) throw new Error('Expected edit');
  expect(changed.document.reference).toEqual(basis.reference);
  expect(changed.document.binding).toEqual(basis.binding);
  expect(changed.document.take).toEqual(basis.take);
  expect(applyProjectSourceVoiceoverEdit(changed.project, basis, { enabled: false })).toEqual({
    ok: false,
    reason: 'stale',
  });
  expect(
    applyProjectSourceVoiceoverEdit(changed.project, changed.document, { enabled: true })
  ).toMatchObject({ ok: true, project: changed.project });
  const removed = applyProjectSourceVoiceoverEdit(changed.project, changed.document, null);
  expect(removed).toMatchObject({
    ok: true,
    project: { version: 31, sourceVoiceoverDocuments: [] },
  });
  expect(added.project).toEqual(before);
  document.take.volume = 0;
  expect(basis.take.volume).toBe(1.5);
});

it('copies complete takes into independent instances and refuses identity collisions atomically', () => {
  const { document } = fixture();
  const before = structuredClone(document);
  const instances = new Map([[document.binding.sourceInstanceId, 'new-instance']]);
  let id = 0;
  const copied = duplicateProjectSourceVoiceoverDocuments(
    [document],
    instances,
    () => `new-${++id}`
  );
  expect(copied).toHaveLength(2);
  expect(copied?.[1]).toMatchObject({
    id: 'new-1',
    binding: { sourceInstanceId: 'new-instance' },
    take: { id: 'new-2', assetId: document.take.assetId },
  });
  copied![1]!.take.sourceAnchor![0]!.offset = 100;
  expect(document).toEqual(before);
  expect(
    duplicateProjectSourceVoiceoverDocuments([document], instances, () => document.id)
  ).toBeNull();
});

it('retains accepted replacement resources independently of native sample provenance', () => {
  const { project, document, audio } = fixture();
  const replacement = {
    ...audio,
    id: 'project-asset:replacement',
    metadata: { ...audio.metadata, duration: 1 },
  };
  project.assets.push(replacement);
  const profile = { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' as const };
  document.take.transcript = {
    version: 1,
    phrases: [],
    replacements: [
      {
        id: 'replacement',
        start: 1,
        end: 3,
        duration: 1,
        assetId: replacement.id,
        phraseId: 'deleted-text',
        revision: 1,
        text: 'Accepted',
        profile,
        textSignature: reviewSpeechTextSignature('Accepted', profile),
      },
    ],
  };
  document.take.dormant = true;
  project.clips = [];
  project.version = 31;
  project.sourceVoiceoverDocuments = [document];
  expect(isExportReadyVideoProject(project)).toBe(true);
  const before = structuredClone(project);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(project)))).toEqual(before);
  project.assets = project.assets.filter((asset) => asset.id !== replacement.id);
  expect(isExportReadyVideoProject(project)).toBe(false);
  project.assets.push({ ...replacement, metadata: { ...replacement.metadata, duration: 0.5 } });
  expect(isExportReadyVideoProject(project)).toBe(false);
});

function pairedFixture() {
  const result = fixture();
  const { project, clip, document } = result;
  const originalTrack = createVideoProjectTrack('Original', 2, 'AUDIO');
  const source = project.assets.find((asset) => asset.id === clip.assetId)!;
  source.metadata.hasAudio = true;
  const original = createAudioClipFromAsset(originalTrack.id, source);
  document.originalAudioSourceInstanceId = original.sourceInstanceId ?? original.id;
  project.tracks.push(originalTrack);
  project.clips.push(original);
  project.version = 31;
  project.sourceVoiceoverDocuments = [document];
  expect(isExportReadyVideoProject(project)).toBe(true);
  return { ...result, originalTrack, original };
}

it('retains the paired original identity through admission and missing placements', () => {
  const { project, document } = pairedFixture();
  const before = structuredClone(project);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(project)))).toEqual(before);
  project.clips = [];
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(project.sourceVoiceoverDocuments).toEqual([document]);
});

it.each(['', ' ', 'a'.repeat(257), 7, null])('refuses malformed original target %s', (target) => {
  const { document } = fixture();
  Reflect.set(document, 'originalAudioSourceInstanceId', target);
  expect(parseVideoProjectSourceVoiceoverDocuments([document])).toBeNull();
});

it('reserves omission for the direct source and rejects an explicit VIDEO target', () => {
  const { document } = fixture();
  document.originalAudioSourceInstanceId = document.binding.sourceInstanceId;
  expect(parseVideoProjectSourceVoiceoverDocuments([document])).toBeNull();
  const { project, clip, document: paired } = pairedFixture();
  project.clips.push({
    ...clip,
    id: 'foreign-video',
    sourceInstanceId: paired.originalAudioSourceInstanceId!,
  });
  expect(isExportReadyVideoProject(project)).toBe(false);
});

it('rejects conflicting target assets in clips and across retained documents', () => {
  const { project, original, audio, document } = pairedFixture();
  original.assetId = audio.id;
  expect(isExportReadyVideoProject(project)).toBe(false);
  project.clips = [];
  const { originalAudioSourceInstanceId, ...other } = document;
  project.sourceVoiceoverDocuments!.push({
    ...other,
    id: 'other',
    binding: {
      kind: 'source',
      assetId: audio.id,
      sourceInstanceId: originalAudioSourceInstanceId!,
    },
    take: { ...document.take, id: 'other-take' },
  });
  expect(isExportReadyVideoProject(project)).toBe(false);
});

it('keeps the paired target immutable and refuses edits when its track is locked', () => {
  const { project, document, originalTrack } = pairedFixture();
  originalTrack.locked = true;
  const before = structuredClone(project);
  expect(applyProjectSourceVoiceoverEdit(project, document, { enabled: true })).toEqual({
    ok: false,
    reason: 'locked',
  });
  expect(project).toEqual(before);
  originalTrack.locked = false;
  const patch = { enabled: true, originalAudioSourceInstanceId: 'forged' };
  const result = applyProjectSourceVoiceoverEdit(project, document, patch);
  if (!result.ok || !result.document) throw new Error('Expected accepted edit');
  expect(result.document.originalAudioSourceInstanceId).toBe(
    document.originalAudioSourceInstanceId
  );
});

it.each([false, true])('remaps paired audio only when that instance is copied: %s', (copyAudio) => {
  const { document } = pairedFixture();
  const before = structuredClone(document);
  const instances = new Map([[document.binding.sourceInstanceId, 'new-video']]);
  if (copyAudio) instances.set(document.originalAudioSourceInstanceId!, 'new-audio');
  let id = 0;
  const copied = duplicateProjectSourceVoiceoverDocuments(
    [document],
    instances,
    () => `copy-${++id}`
  );
  expect(copied).toHaveLength(2);
  expect(copied![0]).toEqual(before);
  expect(copied![1]!.binding.sourceInstanceId).toBe('new-video');
  if (copyAudio) expect(copied![1]!.originalAudioSourceInstanceId).toBe('new-audio');
  else expect(copied![1]).not.toHaveProperty('originalAudioSourceInstanceId');
  expect(document).toEqual(before);
});
