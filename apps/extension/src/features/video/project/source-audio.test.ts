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
