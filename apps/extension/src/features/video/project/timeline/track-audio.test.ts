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
import { getClipCompositeAudioGain } from './presentation.gain';
import { getProjectOriginalAudioRanges } from './original-audio';
import { resolveSceneBackgroundAudioEnvelope } from '../scene/background-audio';
import { getProjectTrackAudioVolume, updateProjectTrackAudioVolume } from './track-audio';

function fixture() {
  const project = createEmptyVideoProject('Track master');
  const track = createVideoProjectTrack('Music', 1, 'AUDIO');
  const other = createVideoProjectTrack('Voice', 2, 'AUDIO');
  const asset = createVideoProjectAsset(
    'Music',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 10,
      hasAudio: true,
      audioPeaks: [0.1, 0.1],
    }
  );
  const clip = createAudioClipFromAsset(track.id, asset);
  clip.volume = 1;
  clip.audioGainStart = clip.audioGainEnd = 1.5;
  clip.volumeEnvelopeStart = clip.volumeEnvelopeEnd = 1.5;
  clip.fadeInMs = clip.fadeOutMs = 0;
  const neighbor = { ...clip, id: 'neighbor', trackId: other.id };
  project.assets = [asset];
  project.tracks.push(track, other);
  project.clips = [clip, neighbor];
  return { project, track, other, clip, neighbor };
}

it('changes one independent master without changing clips and retains schema through removal', () => {
  const { project, track, other } = fixture();
  const before = structuredClone(project);
  const changed = updateProjectTrackAudioVolume(project, track.id, 2);
  expect(changed.version).toBe(7);
  expect(changed.clips).toBe(project.clips);
  expect(changed.tracks.find((item) => item.id === other.id)).toBe(other);
  expect(getProjectTrackAudioVolume(changed, track.id)).toBe(2);
  expect(getProjectTrackAudioVolume(changed, other.id)).toBe(1);
  expect(project).toEqual(before);
  const removed = applyVideoProjectMutationPatch(changed, {
    tracks: changed.tracks.filter((item) => item.id !== track.id),
  });
  expect(removed.version).toBe(7);
  expect(getProjectTrackAudioVolume(removed, track.id)).toBe(1);
  expect(applyVideoProjectMutationPatch(changed, { name: 'Rename' }).version).toBe(7);
});

it('refuses invalid, missing, non-audio and locked masters and permits a fresh valid retry', () => {
  const { project, track } = fixture();
  for (const value of [-1, 2.01, Infinity, NaN])
    expect(updateProjectTrackAudioVolume(project, track.id, value)).toBe(project);
  expect(updateProjectTrackAudioVolume(project, 'missing', 0)).toBe(project);
  expect(updateProjectTrackAudioVolume(project, project.tracks[0]!.id, 0)).toBe(project);
  expect(updateProjectTrackAudioVolume(project, track.id, 1)).toBe(project);
  track.locked = true;
  expect(updateProjectTrackAudioVolume(project, track.id, 0)).toBe(project);
  track.locked = false;
  expect(
    getProjectTrackAudioVolume(updateProjectTrackAudioVolume(project, track.id, 0), track.id)
  ).toBe(0);
});

it('multiplies a master once, follows destination tracks and drives the scene envelope', () => {
  const { project, track, other, clip, neighbor } = fixture();
  track.audioVolume = 2;
  expect(getClipCompositeAudioGain(project, clip, 3)).toBe(3);
  expect(getClipCompositeAudioGain(project, neighbor, 3)).toBe(1.5);
  expect(resolveSceneBackgroundAudioEnvelope(project, 3)).toBeCloseTo(Math.hypot(0.3, 0.15), 12);
  clip.trackId = other.id;
  expect(getClipCompositeAudioGain(project, clip, 3)).toBe(1.5);
  other.audioVolume = 0;
  expect(getClipCompositeAudioGain(project, clip, 3)).toBe(0);
});

it('keeps original attenuation bindings independent of master zero and visibility', () => {
  const { project, track, other, clip, neighbor } = fixture();
  track.audioVolume = 2;
  neighbor.trackId = other.id;
  neighbor.originalAudioMute = {
    volume: 0.25,
    targets: [{ assetId: clip.assetId, sourceInstanceId: clip.id }],
  };
  other.audioVolume = 0;
  expect(getClipCompositeAudioGain(project, clip, 3)).toBe(0.75);
  expect(getProjectOriginalAudioRanges(project, clip)).toHaveLength(1);
  other.visible = false;
  expect(getClipCompositeAudioGain(project, clip, 3)).toBe(3);
  other.visible = true;
  expect(getClipCompositeAudioGain(project, clip, 3)).toBe(0.75);
});

it('roundtrips schema seven through admission and hydration without changing authored fields', () => {
  const { project, track } = fixture();
  const changed = updateProjectTrackAudioVolume(project, track.id, 0.37);
  const serialized: unknown = JSON.parse(JSON.stringify(changed));
  const parsed = parseHydratableVideoProject(serialized);
  expect(parsed).toEqual(changed);
  expect(getProjectTrackAudioVolume(hydrateVideoProject(parsed!), track.id)).toBe(0.37);
  for (const version of [2, 3, 4, 5, 6, 13])
    expect(parseHydratableVideoProject({ ...changed, version })).toBeNull();
  for (const version of [2, 3, 4, 5, 6, 7])
    expect(parseHydratableVideoProject({ ...project, version })).not.toBeNull();
});
