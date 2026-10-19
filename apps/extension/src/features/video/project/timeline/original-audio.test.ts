import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createAudioClipFromAsset } from '../factories/clip';
import { applyVideoProjectMutationPatch } from '../mutation';
import { hydrateVideoProject } from '../hydration';
import { parseHydratableVideoProject } from '../validation/root';
import { resolveSceneBackgroundAudioEnvelope } from '../scene/background-audio';
import { getClipAudioGain, getClipCompositeAudioGain } from './presentation.gain';
import { getProjectOriginalAudioRanges } from './original-audio';

function fixture() {
  const project = createEmptyVideoProject('Original audio');
  const track = createVideoProjectTrack('Audio', 1, 'AUDIO');
  project.tracks.push(track);
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'local-source' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: [1, 1, 1, 1],
    }
  );
  const source = createAudioClipFromAsset(track.id, asset);
  source.sourceInstanceId = 'source-instance';
  source.volume = 0.8;
  source.audioGainStart = 0.8;
  source.audioGainEnd = 0.4;
  source.volumeEnvelopeEnd = 0.5;
  const voiceAsset = { ...asset, id: 'voice-asset', name: 'Voice' };
  const take = createAudioClipFromAsset(track.id, voiceAsset, 2);
  take.duration = 2;
  take.sourceDuration = 2;
  take.volume = 0;
  take.originalAudioMute = {
    volume: 0.25,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.sourceInstanceId }],
  };
  project.duration = 8;
  project.assets = [asset, voiceAsset];
  project.clips = [source, take];
  return { project: applyVideoProjectMutationPatch(project, {}), source, take };
}

it('fences new authored metadata at version six and preserves JSON and hydration round trips', () => {
  const { project, take } = fixture();
  expect(project.version).toBe(6);
  const serialized: unknown = JSON.parse(JSON.stringify(project));
  const parsed = parseHydratableVideoProject(serialized);
  expect(parsed).not.toBeNull();
  if (!parsed) throw new Error('Expected admitted project');
  expect(hydrateVideoProject(parsed).clips.find((clip) => clip.id === take.id)).toMatchObject({
    originalAudioMute: take.originalAudioMute,
  });
  for (const version of [2, 3, 4, 5] as const) {
    expect(parseHydratableVideoProject({ ...project, version })).toBeNull();
    const legacy = {
      ...project,
      version,
      clips: project.clips.filter((clip) => clip.id !== take.id),
    };
    expect(parseHydratableVideoProject(legacy)).not.toBeNull();
    expect(applyVideoProjectMutationPatch(legacy, {}).version).toBe(version);
  }
  const restored = applyVideoProjectMutationPatch(project, {
    clips: project.clips.filter((clip) => clip.id !== take.id),
  });
  expect(restored.version).toBe(6);
  expect(parseHydratableVideoProject(restored)).not.toBeNull();
});

it('matches both asset and instance and leaves missing or recreated identities inert', () => {
  const { project, source } = fixture();
  expect(getProjectOriginalAudioRanges(project, source)).toEqual([
    { start: 2, end: 4, volume: 0.25 },
  ]);
  for (const clip of [
    { ...source, sourceInstanceId: 'new-instance' },
    { ...source, assetId: 'new-asset' },
  ]) {
    expect(getProjectOriginalAudioRanges(project, clip)).toEqual([]);
  }
  const before = structuredClone(project);
  expect(getProjectOriginalAudioRanges(project, source)).toEqual(
    getProjectOriginalAudioRanges(project, source)
  );
  expect(project).toEqual(before);
});

it('follows current take geometry independently of its mute, gain and source speed', () => {
  const { project, source, take } = fixture();
  take.startTime = 3;
  take.duration = 1;
  take.playbackRate = 2;
  take.muted = true;
  expect(getProjectOriginalAudioRanges(project, source)).toEqual([
    { start: 3, end: 4, volume: 0.25 },
  ]);
  expect(
    getProjectOriginalAudioRanges(project, { ...source, startTime: 3.5, duration: 0.25 })
  ).toEqual([{ start: 3.5, end: 3.75, volume: 0.25 }]);
});

it('uses minimum overlap once and restores only the removed layer without changing manual gain', () => {
  const { project, source, take } = fixture();
  const before = structuredClone(source);
  const second = {
    ...take,
    id: 'second',
    startTime: 3,
    originalAudioMute: { ...take.originalAudioMute!, volume: 0.5 },
  };
  project.clips.push(second, { ...second, id: 'third' });
  expect(getProjectOriginalAudioRanges(project, source)).toEqual([
    { start: 2, end: 4, volume: 0.25 },
    { start: 4, end: 5, volume: 0.5 },
  ]);
  expect(getClipCompositeAudioGain(project, source, 3)).toBeCloseTo(
    getClipAudioGain(source, 3) * 0.25,
    12
  );
  expect(resolveSceneBackgroundAudioEnvelope(project, 3)).toBeCloseTo(
    getClipAudioGain(source, 3) * 0.25,
    12
  );
  delete take.originalAudioMute;
  expect(getClipCompositeAudioGain(project, source, 3)).toBeCloseTo(
    getClipAudioGain(source, 3) * 0.5,
    12
  );
  project.clips = [source];
  expect(getClipCompositeAudioGain(project, source, 3)).toBe(getClipAudioGain(source, 3));
  expect(source).toEqual(before);
});

it('multiplies attenuation with fades and leaves half-open tails at manual gain', () => {
  const { project, source } = fixture();
  source.fadeInMs = 4000;
  source.fadeOutMs = 1000;
  expect(getClipCompositeAudioGain(project, source, 2)).toBeCloseTo(
    getClipAudioGain(source, 2) * 0.25,
    12
  );
  expect(getClipCompositeAudioGain(project, source, 4)).toBe(getClipAudioGain(source, 4));
});

it('retains the existing crossfade multiplier as a separate gain factor', () => {
  const { project, source, take } = fixture();
  take.startTime = 6;
  take.duration = 2;
  const incoming = {
    ...source,
    id: 'incoming',
    sourceInstanceId: 'incoming-instance',
    startTime: 7,
    duration: 2,
    sourceDuration: 2,
    muted: true,
  };
  project.clips.push(incoming);
  project.duration = 9;
  project.transitions = [
    {
      id: 'crossfade',
      leadingClipId: source.id,
      trailingClipId: incoming.id,
      duration: 1,
      kind: 'CROSSFADE',
      easing: 'LINEAR',
    },
  ];
  const time = 7.5;
  const withoutOverride = {
    ...project,
    clips: project.clips.filter((clip) => clip.id !== take.id),
  };
  expect(getClipCompositeAudioGain(withoutOverride, source, time)).toBeCloseTo(
    getClipAudioGain(source, time) * 0.5,
    12
  );
  expect(getClipCompositeAudioGain(project, source, time)).toBeCloseTo(
    getClipCompositeAudioGain(withoutOverride, source, time) * 0.25,
    12
  );
});
