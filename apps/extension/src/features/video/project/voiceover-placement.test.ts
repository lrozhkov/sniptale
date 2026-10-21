import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import { projectSourceVoiceoverPlacement } from './voiceover-placement';
import { anchorReviewVoiceoverAtSource, projectReviewVoiceover } from '../review/voiceover-edits';
import { buildReviewTimeMap } from '../review/timeline';
import type { QuickEditAudioClip } from '../review/advanced/types';
import type { ReviewTimeSegment } from '../review/time-segment';

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
  const take: QuickEditAudioClip = {
    id: 'whole',
    assetId: 'voice',
    timelineStart: 1,
    sourceOffset: 0.5,
    duration: 4,
    volume: 1,
    muted: false,
    fadeIn: 0.25,
    fadeOut: 0.5,
  };
  return { project, clip, take };
}
function sample(views: readonly QuickEditAudioClip[], time: number) {
  const view = views.find(
    (view) => time >= view.timelineStart && time < view.timelineStart + view.duration
  );
  return view ? view.sourceOffset + (time - view.timelineStart) * (view.playbackRate ?? 1) : null;
}
const reference = () =>
  buildReviewTimeMap(8, [
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
function placement(segment: ReviewTimeSegment, id: string) {
  const { clip } = fixture();
  return {
    ...clip,
    id,
    sourceStart: segment.sourceStart,
    sourceDuration: segment.sourceEnd - segment.sourceStart,
    startTime: segment.resultStart,
    duration: segment.resultEnd - segment.resultStart,
    playbackRate: segment.rate,
  };
}

it.each([0.25, 1, 4])(
  'matches Gallery native samples and fade phase at independent take tempo %s',
  (tempo) => {
    const map = reference();
    const take = anchorReviewVoiceoverAtSource({ ...fixture().take, tempo }, map);
    const before = structuredClone({ take, map });
    const clips = map
      .filter((part) => part.kind !== 'cut')
      .map((part, index) => placement(part, `clip-${index}`));
    const views = clips.flatMap((clip) => projectSourceVoiceoverPlacement(take, map, clip));
    const gallery = projectReviewVoiceover([take], map);
    for (const clip of clips)
      for (let step = 1; step < 32; step++) {
        const time = clip.startTime + (clip.duration * step) / 32;
        const expected = sample(gallery, time),
          actual = sample(views, time);
        if (expected === null) expect(actual).toBeNull();
        else expect(actual).toBeCloseTo(expected, 12);
      }
    for (const view of views) {
      expect(view.playbackRate).toBe(tempo);
      expect(view.fadePhase?.duration).toBe(take.duration);
      expect(view.fadePhase?.offset).toBeCloseTo(view.sourceOffset - take.sourceOffset, 12);
      expect(view.fadeIn).toBe(take.fadeIn);
      expect(view.fadeOut).toBe(take.fadeOut);
      expect(view.sourceAnchor).toBeUndefined();
    }
    expect({ take, map }).toEqual(before);
  }
);

it('keeps overlapping and reordered Native placements independent', () => {
  const map = buildReviewTimeMap(8, []);
  const take = anchorReviewVoiceoverAtSource({ ...fixture().take, timelineStart: 0 }, map);
  const { clip } = fixture();
  const first = {
    ...clip,
    id: 'first',
    startTime: 0,
    duration: 2,
    sourceStart: 0,
    sourceDuration: 2,
    playbackRate: 1,
  };
  const second = {
    ...clip,
    id: 'second',
    startTime: 3,
    duration: 1,
    sourceStart: 1,
    sourceDuration: 2,
    playbackRate: 2,
  };
  const before = structuredClone({ take, map, first, second });
  const views = [second, first].flatMap((clip) => projectSourceVoiceoverPlacement(take, map, clip));
  for (let time = 3.01; time < 3.99; time += 0.03125)
    expect(sample(views, time)).toBeCloseTo(1.5 + time - 3, 12);
  expect(new Set(views.map((view) => view.id)).size).toBe(views.length);
  expect(projectSourceVoiceoverPlacement(take, map, second)).toEqual(
    projectSourceVoiceoverPlacement(take, map, second)
  );
  expect({ take, map, first, second }).toEqual(before);
});

it('retains capture prefix phase after moving a split to another track', () => {
  const map = buildReviewTimeMap(4, [
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
  ]);
  const take = anchorReviewVoiceoverAtSource(
    { ...fixture().take, duration: 3, timelineStart: 0 },
    map
  );
  const clip = {
    ...fixture().clip,
    trackId: 'other-track',
    sourceStart: 2,
    sourceDuration: 2,
    startTime: 5,
    duration: 2,
    playbackRate: 1,
  };
  const views = projectSourceVoiceoverPlacement(take, map, clip);
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({
    timelineStart: 5,
    sourceOffset: 1.5,
    duration: 2,
    playbackRate: 1,
    fadePhase: { offset: 1, duration: 3 },
  });
});

it.each([0.0625, 16])(
  'supports Native video rate %s without changing audio tempo',
  (playbackRate) => {
    const map = buildReviewTimeMap(8, []);
    const take = anchorReviewVoiceoverAtSource({ ...fixture().take, timelineStart: 0 }, map);
    const clip = {
      ...fixture().clip,
      sourceStart: 0,
      sourceDuration: 4,
      startTime: 2,
      duration: 4 / playbackRate,
      playbackRate,
    };
    const before = structuredClone(take);
    const views = projectSourceVoiceoverPlacement(take, map, clip);
    expect(views.every((view) => view.playbackRate === 1)).toBe(true);
    expect(views.reduce((duration, view) => duration + view.duration, 0)).toBe(
      Math.min(4, 4 / playbackRate)
    );
    expect(views.every((view) => view.fadePhase?.duration === 4)).toBe(true);
    expect(take).toEqual(before);
  }
);

it('restores cut-hidden content and leaves dormant or absent anchors inert', () => {
  const map = buildReviewTimeMap(8, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  ]);
  const take = anchorReviewVoiceoverAtSource({ ...fixture().take, timelineStart: 1 }, map);
  const clip = {
    ...fixture().clip,
    sourceStart: 2,
    sourceDuration: 2,
    startTime: 3,
    duration: 2,
    playbackRate: 1,
  };
  const views = projectSourceVoiceoverPlacement(take, map, clip);
  expect(views.reduce((duration, view) => duration + view.duration, 0)).toBe(2);
  expect(views[0]?.sourceOffset).toBe(1.5);
  expect(projectSourceVoiceoverPlacement({ ...take, dormant: true }, map, clip)).toEqual([]);
  expect(projectSourceVoiceoverPlacement(fixture().take, map, clip)).toEqual([]);
  expect(projectSourceVoiceoverPlacement(take, [], clip)).toEqual([]);
  expect(projectSourceVoiceoverPlacement(take, map, { ...clip, duration: 0 })).toEqual([]);
  expect(projectSourceVoiceoverPlacement(take, map, { ...clip, sourceDuration: 0 })).toEqual([]);
});

it('retains authored source gaps and distinct identities for repeated source ranges', () => {
  const map = buildReviewTimeMap(8, []);
  const take = {
    ...fixture().take,
    duration: 3,
    sourceAnchor: [
      { start: 1, end: 2, offset: 0, duration: 1 },
      { start: 5, end: 7, offset: 1, duration: 2 },
    ],
  };
  const clip = { ...fixture().clip, startTime: 0, sourceStart: 0, sourceDuration: 8, duration: 8 };
  const views = projectSourceVoiceoverPlacement(take, map, clip);
  expect(views.map((view) => [view.timelineStart, view.sourceOffset, view.duration])).toEqual([
    [1, 0.5, 1],
    [5, 1.5, 2],
  ]);
  const repeated = projectSourceVoiceoverPlacement(take, map, {
    ...clip,
    id: 'repeated',
    startTime: 10,
  });
  expect(new Set([...views, ...repeated].map((view) => view.id)).size).toBe(4);
  expect(take.sourceAnchor).toHaveLength(2);
});
