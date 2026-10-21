import { expect, it } from 'vitest';
import { projectSourceVoiceoverViews } from './source-voiceover-views';
import { buildReviewTimeMap } from '../review/timeline';
import { anchorReviewVoiceoverAtSource, projectReviewVoiceover } from '../review/voiceover-edits';
import { buildQuickEditAudioPlan } from '../review/advanced/audio-plan';
import {
  planProjectSourceVoiceoverPlayback,
  getProjectSourceVoiceoverOriginalAudioRanges,
} from './source-voiceover-playback';
import { getProjectOriginalAudioRanges } from './timeline/original-audio';
import { isExportReadyVideoProject } from './validation/root';
import {
  sourceVoiceoverPlaybackFixture as fixture,
  pairedSourceVoiceoverPlaybackFixture as pairedFixture,
} from './source-voiceover-playback.test-support';

it.each([0.25, 1, 4])(
  'matches Gallery clocks, tempo and fades after continuous cuts at tempo %s',
  (tempo) => {
    const { project, clip, document } = fixture(tempo);
    project.clips = [0, 1, 2, 3].map((index) => ({
      ...clip,
      id: `part-${index}`,
      sourceInstanceId: document.binding.sourceInstanceId,
      startTime: index * 2,
      sourceStart: index * 2,
      duration: 2,
      sourceDuration: 2,
    }));
    const before = structuredClone(project);
    const actual = planProjectSourceVoiceoverPlayback(project);
    const expected = buildQuickEditAudioPlan({
      voiceover: projectReviewVoiceover([document.take], document.reference),
      music: [],
    });
    expect(actual.map(({ entry }) => ({ ...entry, clipId: null }))).toEqual(
      expected.map((entry) => ({ ...entry, clipId: null }))
    );
    expect(project).toEqual(before);
  }
);

it('keeps source mute, voice master, dormancy and visibility independent', () => {
  const { project, clip, document, track } = fixture();
  clip.muted = true;
  track.audioVolume = 2;
  expect(planProjectSourceVoiceoverPlayback(project)[0]?.entry.volume).toBe(3);
  document.take.muted = true;
  expect(planProjectSourceVoiceoverPlayback(project)[0]?.entry.volume).toBe(0);
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, clip)).toHaveLength(1);
  document.take.muted = false;
  track.audioVolume = 0;
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, clip)).toHaveLength(1);
  document.take.dormant = true;
  expect(planProjectSourceVoiceoverPlayback(project)).toEqual([]);
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, clip)).toEqual([]);
  document.take.dormant = false;
  track.visible = false;
  expect(planProjectSourceVoiceoverPlayback(project)).toEqual([]);
  track.visible = true;
  document.enabled = false;
  expect(planProjectSourceVoiceoverPlayback(project)).toEqual([]);
  document.enabled = true;
  project.tracks.find((track) => track.id === clip.trackId)!.visible = false;
  expect(planProjectSourceVoiceoverPlayback(project)).toEqual([]);
});

it('scopes attenuation to each overlapping occurrence and preserves ordinary overrides', () => {
  const { project, clip, document } = fixture();
  document.take = anchorReviewVoiceoverAtSource(
    { ...document.take, timelineStart: 1, duration: 1 },
    document.reference
  );
  const a = {
    ...clip,
    sourceInstanceId: document.binding.sourceInstanceId,
    duration: 2,
    sourceDuration: 2,
  };
  const b = {
    ...a,
    id: 'overlap',
    sourceStart: 1,
    duration: 1,
    sourceDuration: 2,
    playbackRate: 2,
  };
  project.clips = [a, b];
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, a)).toEqual([
    { start: 1, end: 2, volume: 0.25 },
  ]);
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, b)).toEqual([
    { start: 0, end: 1, volume: 0.25 },
  ]);
  expect(getProjectOriginalAudioRanges(project, a)).toEqual([{ start: 1, end: 2, volume: 0.25 }]);
  expect(planProjectSourceVoiceoverPlayback(project)).toHaveLength(2);
});

it('preserves separate overlapping branches while joining their continuous endpoints', () => {
  const { project, clip, document } = fixture();
  project.clips = [
    {
      ...clip,
      id: 'a1',
      sourceInstanceId: document.binding.sourceInstanceId,
      duration: 1,
      sourceDuration: 1,
    },
    {
      ...clip,
      id: 'b',
      sourceInstanceId: document.binding.sourceInstanceId,
      startTime: 0.5,
      duration: 2,
      sourceDuration: 2,
    },
    {
      ...clip,
      id: 'a2',
      sourceInstanceId: document.binding.sourceInstanceId,
      startTime: 1,
      sourceStart: 1,
      duration: 1,
      sourceDuration: 1,
    },
  ];
  expect(
    planProjectSourceVoiceoverPlayback(project).map((item) => [
      item.entry.timelineStart,
      item.entry.duration,
    ])
  ).toEqual([
    [0, 2],
    [0.5, 2],
  ]);
});

it('indexes ten thousand separated placements without losing voices or mutating the source', () => {
  const { project, clip, document } = fixture();
  project.clips = Array.from({ length: 10_000 }, (_, index) => ({
    ...clip,
    id: `part-${index}`,
    sourceInstanceId: document.binding.sourceInstanceId,
    startTime: index * 2,
    duration: 1,
    sourceDuration: 1,
  }));
  const before = structuredClone(project);
  expect(planProjectSourceVoiceoverPlayback(project)).toHaveLength(10_000);
  expect(project).toEqual(before);
});

it.each([0.25, 1, 4])('matches Gallery across capture cuts and speed at tempo %s', (tempo) => {
  const { project, clip, document } = fixture(tempo);
  const reference = buildReviewTimeMap(8, [
    {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 2,
      requestedStart: 0,
      requestedEnd: 2,
      rate: 2,
      audio: 'speed',
    },
    { id: 'cut', kind: 'cut', start: 3, end: 4, requestedStart: 3, requestedEnd: 4 },
  ]);
  document.reference = reference;
  const rawTake = { ...document.take };
  delete rawTake.sourceAnchor;
  document.take = anchorReviewVoiceoverAtSource(rawTake, reference);
  project.clips = reference
    .filter((part) => part.kind !== 'cut')
    .map((part, index) => ({
      ...clip,
      id: `part-${index}`,
      sourceInstanceId: document.binding.sourceInstanceId,
      startTime: part.resultStart,
      sourceStart: part.sourceStart,
      sourceDuration: part.sourceEnd - part.sourceStart,
      duration: part.resultEnd - part.resultStart,
      playbackRate: part.rate,
    }));
  const actual = planProjectSourceVoiceoverPlayback(project).map((item) => item.entry);
  const expected = buildQuickEditAudioPlan({
    voiceover: projectReviewVoiceover([document.take], reference),
    music: [],
  });
  expect(actual.map((entry) => ({ ...entry, clipId: null }))).toEqual(
    expected.map((entry) => ({ ...entry, clipId: null }))
  );
});

it('retains transcript replacements without adding extra playback sources', () => {
  const { project, document } = fixture();
  const before = planProjectSourceVoiceoverPlayback(project);
  document.take.transcript = {
    version: 1,
    phrases: [],
    replacements: [
      {
        id: 'replacement',
        start: 0,
        end: 1,
        phraseId: 'phrase',
        revision: 0,
        profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' },
        assetId: 'project-asset:replacement',
        duration: 1,
        text: 'Retained history',
        textSignature: 'signature',
      },
    ],
  };
  expect(planProjectSourceVoiceoverPlayback(project)).toEqual(before);
});

it('keeps disabled, muted and hidden source occurrences inspectable without enabling playback', () => {
  const { project, document, track, clip } = fixture();
  document.enabled = false;
  document.take.muted = true;
  track.visible = false;
  project.tracks.find((track) => track.id === clip.trackId)!.visible = false;
  const before = structuredClone(project);
  const views = projectSourceVoiceoverViews(project, document);
  expect(views).toHaveLength(1);
  expect(views[0]!.sourceVisible).toBe(false);
  expect(views[0]!.clip.muted).toBe(true);
  expect(planProjectSourceVoiceoverPlayback(project)).toEqual([]);
  expect(project).toEqual(before);
  document.take.dormant = true;
  expect(projectSourceVoiceoverViews(project, document)).toEqual([]);
});

it('keeps overlapping occurrence views independent and rejects other asset and instance identities', () => {
  const { project, document, clip } = fixture();
  project.clips = [
    { ...clip, sourceInstanceId: document.binding.sourceInstanceId },
    {
      ...clip,
      id: 'overlap',
      sourceInstanceId: document.binding.sourceInstanceId,
      startTime: 1,
      playbackRate: 2,
      duration: 4,
    },
    {
      ...clip,
      id: 'other-asset',
      assetId: 'foreign',
      sourceInstanceId: document.binding.sourceInstanceId,
    },
    { ...clip, id: 'other-instance', sourceInstanceId: 'foreign' },
  ];
  const views = projectSourceVoiceoverViews(project, document);
  expect(views.map((view) => view.sourceClipId)).toEqual([clip.id, 'overlap']);
  expect(
    views.map((view) => [view.clip.timelineStart, view.clip.duration, view.clip.playbackRate])
  ).toEqual([
    [0, 4, 1],
    [1, 4, 1],
  ]);
  expect(planProjectSourceVoiceoverPlayback(project)).toHaveLength(2);
});

it('keeps paired suppression through voice mute and master zero and releases only inactive layers', () => {
  const { project, document, track, clip, original, originalTrack } = pairedFixture();
  expect(isExportReadyVideoProject(project)).toBe(true);
  const ranges = [{ start: 0, end: 4, volume: 0.25 }];
  document.take.muted = true;
  track.audioVolume = 0;
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, original)).toEqual(ranges);
  for (const inactive of ['disabled', 'dormant', 'own-hidden', 'source-hidden'] as const) {
    document.enabled = inactive !== 'disabled';
    document.take.dormant = inactive === 'dormant';
    track.visible = inactive !== 'own-hidden';
    project.tracks.find((item) => item.id === clip.trackId)!.visible = inactive !== 'source-hidden';
    expect(getProjectSourceVoiceoverOriginalAudioRanges(project, original)).toEqual([]);
    expect(planProjectSourceVoiceoverPlayback(project)).toEqual([]);
  }
  document.enabled = true;
  document.take.dormant = false;
  document.take.muted = false;
  track.visible = true;
  track.audioVolume = 1;
  project.tracks.find((item) => item.id === clip.trackId)!.visible = true;
  originalTrack.visible = false;
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, original)).toEqual([]);
  expect(planProjectSourceVoiceoverPlayback(project)).toHaveLength(1);
  originalTrack.visible = true;
  original.muted = true;
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, original)).toEqual(ranges);
  expect(planProjectSourceVoiceoverPlayback(project)).toHaveLength(1);
});
