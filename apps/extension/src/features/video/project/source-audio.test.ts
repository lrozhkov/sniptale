import { reviewSpeechTextSignature, type ReviewOriginalSpeech } from '../review/speech-transcript';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import { applyVideoProjectMutationPatch } from './mutation';
import { parseHydratableVideoProject, isExportReadyVideoProject } from './validation/root';
import {
  parseVideoProjectSourceAudioDocuments,
  hasValidVideoProjectSourceAudioReferences,
  getProjectSourceAudioRanges,
  getProjectSourceAudioAttenuationRanges,
  type VideoProjectSourceAudioDocument,
} from './source-audio';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 20,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video placement');
  const document: VideoProjectSourceAudioDocument = {
    id: 'envelope',
    binding: {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
    ranges: [{ id: 'gain', start: 4, end: 8, volume: 2 }],
    mutes: [{ id: 'mute', start: 5, end: 7, volume: 0.25 }],
  };
  return { project, clip, document };
}

it('fences source audio at schema 28 and keeps all old readers without materializing data', () => {
  const { project, document } = fixture();
  for (let version = 2; version <= 27; version++) {
    const old = parseHydratableVideoProject({ ...project, version });
    expect(old).not.toBeNull();
    expect(old).not.toHaveProperty('sourceAudioDocuments');
    expect(
      parseHydratableVideoProject({ ...project, version, sourceAudioDocuments: [document] })
    ).toBeNull();
  }
  const changed = applyVideoProjectMutationPatch(project, { sourceAudioDocuments: [document] });
  expect(changed.version).toBe(28);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))?.sourceAudioDocuments
  ).toEqual([document]);
  expect(applyVideoProjectMutationPatch(changed, { sourceAudioDocuments: [] }).version).toBe(28);
  expect(parseHydratableVideoProject({ ...changed, version: Number.MAX_SAFE_INTEGER })).toBeNull();
});

it('retains dormant ranges without extending duration and refuses missing or aliased sources', () => {
  const { project, clip, document } = fixture();
  const dormant = {
    ...project,
    version: 28 as const,
    clips: [],
    duration: 0,
    sourceAudioDocuments: [document],
  };
  expect(parseHydratableVideoProject(dormant)?.duration).toBe(0);
  expect(isExportReadyVideoProject({ ...dormant, assets: [] })).toBe(false);
  expect(
    hasValidVideoProjectSourceAudioReferences({
      ...dormant,
      clips: [{ ...clip, assetId: 'different' }],
    })
  ).toBe(false);
  const tooLong = structuredClone(document);
  tooLong.ranges[0]!.end = 21;
  expect(isExportReadyVideoProject({ ...dormant, sourceAudioDocuments: [tooLong] })).toBe(false);
});

it.each([0.0625, 0.125, 0.25, 0.5, 1, 1.5, 2, 3, 4, 8, 16])(
  'projects exact source trim at rate %s and isolates another insertion',
  (rate) => {
    const { project, clip, document } = fixture();
    const placement = {
      ...clip,
      sourceStart: 4,
      sourceDuration: 8,
      startTime: 10,
      duration: 4 / rate,
      playbackRate: rate,
    };
    project.sourceAudioDocuments = [document];
    const before = structuredClone(project);
    expect(getProjectSourceAudioRanges(project, placement)).toEqual([
      { start: 10, end: 10 + 4 / rate, volume: 2 },
    ]);
    expect(getProjectSourceAudioAttenuationRanges(project, placement)).toEqual([
      { start: 10 + 1 / rate, end: 10 + 3 / rate, volume: 0.25 },
    ]);
    expect(
      getProjectSourceAudioRanges(project, { ...placement, sourceInstanceId: 'another' })
    ).toEqual([]);
    expect(getProjectSourceAudioRanges(project, { ...placement, sourceStart: 8 })).toEqual([]);
    expect(project).toEqual(before);
  }
);

it('admits bounded distinct documents and refuses duplicate identities, bindings and mixed range IDs', () => {
  const { document } = fixture();
  expect(parseVideoProjectSourceAudioDocuments([document])).toEqual([document]);
  expect(parseVideoProjectSourceAudioDocuments([document, document])).toBeNull();
  expect(
    parseVideoProjectSourceAudioDocuments([document, { ...document, id: 'other' }])
  ).toBeNull();
  expect(
    parseVideoProjectSourceAudioDocuments([
      { ...document, mutes: [{ ...document.mutes[0]!, id: 'gain' }] },
    ])
  ).toBeNull();
  for (const patch of [
    { binding: null },
    { ranges: null },
    { mutes: null },
    { id: ' padded ' },
    { unknown: true },
  ])
    expect(parseVideoProjectSourceAudioDocuments([{ ...document, ...patch }])).toBeNull();
  expect(
    parseVideoProjectSourceAudioDocuments(
      Array.from({ length: 513 }, (_, i) => ({
        ...document,
        id: String(i),
        binding: { ...document.binding, sourceInstanceId: String(i) },
      }))
    )
  ).toBeNull();
});

it('enforces the aggregate budget before accepting multiple independent sources', () => {
  const { document } = fixture();
  const documents = Array.from({ length: 10 }, (_, doc) => ({
    ...document,
    id: String(doc),
    binding: { ...document.binding, sourceInstanceId: String(doc) },
    mutes: [],
    ranges: Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      start: index,
      end: index + 0.5,
      volume: 2,
    })),
  }));
  expect(parseVideoProjectSourceAudioDocuments(documents)).not.toBeNull();
  documents[0]!.ranges.push({ id: 'overflow', start: 501, end: 502, volume: 1 });
  expect(parseVideoProjectSourceAudioDocuments(documents)).toBeNull();
});

function speechFixture() {
  const value = fixture();
  const { project, document } = value;
  const profile = {
    modelId: 'speech',
    voiceId: 'voice',
    responseFormat: 'wav' as const,
    speed: 1.2,
    instructions: 'Calm',
  };
  const speech: ReviewOriginalSpeech = {
    enabled: false,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'recognition',
      phrases: [
        {
          id: 'phrase',
          start: 30,
          end: 32,
          originalText: 'Original',
          text: 'Draft',
          revision: 2,
          alignment: 'word',
          words: [{ text: 'Original', start: 30, end: 31 }],
        },
      ],
      replacements: [
        {
          id: 'history',
          start: 30,
          end: 32,
          duration: 0.5,
          assetId: 'project-asset:speech-history',
          phraseId: 'removed-phrase',
          revision: 1,
          text: 'Accepted',
          textSignature: reviewSpeechTextSignature('Accepted', profile),
          profile,
          enabled: false,
          originalVolume: 0.25,
        },
      ],
    },
  };
  const { recordingPart: _recordingPart, ...assetTemplate } = structuredClone(project.assets[0]!);
  const replacement = {
    ...assetTemplate,
    source: { kind: 'project-asset' as const, projectAssetId: 'speech-history-bytes' },
    id: 'project-asset:speech-history',
    type: 'AUDIO' as const,
    metadata: {
      ...project.assets[0]!.metadata,
      width: 0,
      height: 0,
      duration: 0.5,
      mimeType: 'audio/wav',
      hasAudio: true,
    },
  };
  project.assets.push(replacement);
  document.speech = speech;
  return { ...value, speech, replacement };
}

it('fences retained original speech at schema31 while leaving envelope-only schema28 unchanged', () => {
  const { project, document, speech } = speechFixture();
  const before = structuredClone(project);
  for (let version = 2; version <= 30; version++)
    expect(
      parseHydratableVideoProject({ ...project, version, sourceAudioDocuments: [document] })
    ).toBeNull();
  const admitted = applyVideoProjectMutationPatch(project, { sourceAudioDocuments: [document] });
  expect(admitted.version).toBe(31);
  expect(isExportReadyVideoProject(admitted)).toBe(true);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(admitted)))).toEqual(admitted);
  expect(admitted.sourceAudioDocuments![0]!.speech).toEqual(speech);
  expect(applyVideoProjectMutationPatch(admitted, { sourceAudioDocuments: [] }).version).toBe(31);
  expect(project).toEqual(before);
});

it('retains passive source times beyond the current source and never adds envelope ranges', () => {
  const { project, document, clip } = speechFixture();
  const { speech: _speech, ...envelope } = document;
  const reference = { ...project, sourceAudioDocuments: [envelope] };
  const admitted = applyVideoProjectMutationPatch(project, { sourceAudioDocuments: [document] });
  expect(document.speech!.transcript.phrases[0]!.end).toBeGreaterThan(
    project.assets[0]!.metadata.duration!
  );
  expect(isExportReadyVideoProject(admitted)).toBe(true);
  expect(getProjectSourceAudioRanges(admitted, clip)).toEqual(
    getProjectSourceAudioRanges(reference, clip)
  );
  expect(getProjectSourceAudioAttenuationRanges(admitted, clip)).toEqual(
    getProjectSourceAudioAttenuationRanges(reference, clip)
  );
  document.ranges = [];
  document.mutes = [];
  expect(getProjectSourceAudioRanges(admitted, clip)).toEqual([]);
  expect(getProjectSourceAudioAttenuationRanges(admitted, clip)).toEqual([]);
});

it.each([
  'enabled',
  'replacement-enabled',
  'original-volume',
  'signature',
  'prefix',
  'word',
] as const)('refuses malformed retained speech %s without mutating it', (failure) => {
  const { document } = speechFixture();
  const speech = document.speech!;
  const replacement = speech.transcript.replacements[0]!;
  if (failure === 'enabled') Reflect.set(speech, 'enabled', 'yes');
  if (failure === 'replacement-enabled') Reflect.set(replacement, 'enabled', 'yes');
  if (failure === 'original-volume') replacement.originalVolume = 1.01;
  if (failure === 'signature') replacement.textSignature = 'forged';
  if (failure === 'prefix') replacement.assetId = 'unprefixed';
  if (failure === 'word') speech.transcript.phrases[0]!.words![0]!.start = 29;
  const before = structuredClone(document);
  expect(parseVideoProjectSourceAudioDocuments([document])).toBeNull();
  expect(document).toEqual(before);
});

it.each(['missing', 'wrong-type', 'native-end'] as const)(
  'retains hydratable speech but refuses a %s replacement resource',
  (failure) => {
    const { project, document, replacement } = speechFixture();
    project.version = 31;
    project.clips = [];
    project.sourceAudioDocuments = [document];
    if (failure === 'missing')
      project.assets = project.assets.filter((asset) => asset.id !== replacement.id);
    if (failure === 'wrong-type')
      project.assets = project.assets.map((asset) =>
        asset.id === replacement.id ? { ...project.assets[0]!, id: replacement.id } : asset
      );
    if (failure === 'native-end') replacement.metadata.duration = 0.5 - 1e-6;
    expect(parseHydratableVideoProject(project)).not.toBeNull();
    expect(isExportReadyVideoProject(project)).toBe(false);
  }
);

it('clips source audio ranges to a split placement without holding the audio clock', () => {
  const { project, clip, document } = fixture();
  project.sourceAudioDocuments = [document];
  const placement = {
    ...clip,
    sourceStart: 4,
    sourceDuration: 4,
    startTime: 10,
    duration: 1,
    playbackWindow: { offset: 3.5, holdAt: 3 },
  };
  expect(getProjectSourceAudioRanges(project, placement)).toEqual([
    { start: 10, end: 10.5, volume: 2 },
  ]);
  expect(getProjectSourceAudioAttenuationRanges(project, placement)).toEqual([]);
});
