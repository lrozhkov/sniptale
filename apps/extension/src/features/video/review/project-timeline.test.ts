import { projectVideoProjectTextFragment } from '../project/text/projection';
import type { VideoProjectTextDocument } from '../project/text/types';
import { expect, it, vi } from 'vitest';
import {
  createAudioClip,
  createVideoClip,
  createProject,
} from '../project/timeline/project-meta.test.helpers';
import { getMediaClipSourceTime } from '../project/timeline/rate';
import { planReviewCutTransitions } from './cuts';
import { REVIEW_SPEED_RATES } from './speed';
import { buildReviewTimeMap, sourceToReviewResult } from './timeline';
import type { ReviewEdit } from './types';
import { planReviewProjectTimeline } from './project-timeline';

function fixture(duration = 8) {
  return {
    operationId: 'conversion-1',
    source: { duration, width: 1280, height: 720, size: 100, mimeType: 'video/webm' },
    edits: [] as ReviewEdit[],
    video: createVideoClip({ duration, sourceDuration: duration, sourceInstanceId: 'template' }),
    audio: createAudioClip({ duration, sourceDuration: duration }),
  };
}

it.each(REVIEW_SPEED_RATES)('retains the exact Gallery rate %s in linked source slices', (rate) => {
  const input = fixture();
  input.edits = [
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
      rate,
      audio: 'speed',
    },
    {
      id: 'cut',
      kind: 'cut',
      start: 3,
      end: 4,
      requestedStart: 2.9,
      requestedEnd: 4.1,
      transition: { type: 'dissolve', before: 0.4, after: 0.8 },
    },
  ];
  const before = structuredClone(input);
  const plan = planReviewProjectTimeline(input);
  const segments = buildReviewTimeMap(input.source.duration, input.edits).filter(
    (segment) => segment.kind !== 'cut'
  );
  expect(plan.duration).toBe(segments.at(-1)!.resultEnd);
  expect(plan.videoClips).toHaveLength(segments.length);
  expect(plan.audioClips).toHaveLength(segments.length);
  for (const [index, segment] of segments.entries()) {
    const video = plan.videoClips[index]!;
    const audio = plan.audioClips[index]!;
    expect(video).toMatchObject({
      assetId: input.video.assetId,
      trackId: input.video.trackId,
      startTime: segment.resultStart,
      duration: segment.resultEnd - segment.resultStart,
      sourceStart: segment.sourceStart,
      sourceDuration: segment.sourceEnd - segment.sourceStart,
      playbackRate: segment.rate,
      sourceInstanceId: plan.sourceInstanceId,
      muted: true,
    });
    expect(audio).toMatchObject({
      assetId: video.assetId,
      startTime: video.startTime,
      duration: video.duration,
      playbackRate: video.playbackRate,
      sourceInstanceId: plan.audioSourceInstanceId,
      sourceStart: video.sourceStart,
      sourceDuration: video.sourceDuration,
      groupId: video.groupId,
      linkMode: 'LINKED',
      muted: false,
    });
    const mid = (segment.sourceStart + segment.sourceEnd) / 2;
    const result = sourceToReviewResult(mid, segments)!;
    expect(Math.abs(getMediaClipSourceTime(video, result) - mid)).toBeLessThanOrEqual(
      Number.EPSILON * 16
    );
  }
  expect(plan.transitions).toEqual(planReviewCutTransitions(input.source.duration, input.edits));
  expect(plan.cuts[0]).toMatchObject({
    edit: input.edits[1],
    time: segments[1]!.resultEnd,
    outgoingClipId: plan.videoClips[1]!.id,
    incomingClipId: plan.videoClips[2]!.id,
  });
  expect(input).toEqual(before);
  expect(planReviewProjectTimeline(input)).toEqual(plan);
});

it('keeps template styling independent and mutes only the affected original-audio interval', () => {
  const input = fixture();
  input.video.sourceCrop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  input.edits = [
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
      rate: 2,
      audio: 'mute',
    },
  ];
  const plan = planReviewProjectTimeline(input);
  expect(plan.audioClips.map((clip) => clip.muted)).toEqual([false, true, false]);
  expect(plan.videoClips.map((clip) => clip.sourceCrop)).toEqual(
    Array(3).fill(input.video.sourceCrop)
  );
  expect(plan.videoClips[0]!.transform).not.toBe(input.video.transform);
  plan.videoClips[0]!.transform.x = 33;
  plan.videoClips[0]!.sourceCrop!.x = 0.3;
  expect(plan.videoClips[1]!.transform.x).toBe(input.video.transform.x);
  expect(plan.videoClips[1]!.sourceCrop!.x).toBe(0.1);
  expect(input.video.sourceCrop.x).toBe(0.1);
  const { audio: _audio, ...embedded } = input;
  const single = planReviewProjectTimeline(embedded);
  expect(single.audioClips).toEqual([]);
  expect(single.videoClips.map((clip) => clip.muted)).toEqual([false, true, false]);
  expect(
    single.videoClips.every((clip) => clip.groupId === null && clip.linkMode === 'DETACHED')
  ).toBe(true);
});

it('retains leading, adjacent and trailing cut intents without inventing independent seams', () => {
  const input = fixture();
  input.edits = [
    [0, 1],
    [2, 3],
    [3, 4],
    [7, 8],
  ].map(([start, end], index) => ({
    id: `cut-${index}`,
    kind: 'cut',
    start: start!,
    end: end!,
    requestedStart: start!,
    requestedEnd: end!,
    transition: { type: 'dissolve', before: 0.2, after: 0.2 },
  }));
  const plan = planReviewProjectTimeline(input);
  expect(plan.duration).toBe(4);
  expect(
    plan.videoClips.map((clip) => [clip.sourceStart, clip.sourceDuration, clip.startTime])
  ).toEqual([
    [1, 1, 0],
    [4, 3, 1],
  ]);
  expect(
    plan.cuts.map((cut) => [cut.time, Boolean(cut.outgoingClipId), Boolean(cut.incomingClipId)])
  ).toEqual([
    [0, false, true],
    [1, true, false],
    [1, false, true],
    [4, true, false],
  ]);
  expect(plan.transitions).toEqual([]);
  expect(plan.cuts.map((cut) => cut.edit)).toEqual(input.edits);
});

it('preserves sub-frame and fractional slices without introducing a minimum clip duration', () => {
  const input = fixture(0.05);
  input.edits = [
    { id: 'cut', kind: 'cut', start: 0.01, end: 0.03, requestedStart: 0.01, requestedEnd: 0.03 },
  ];
  const plan = planReviewProjectTimeline(input);
  const segments = buildReviewTimeMap(0.05, input.edits);
  expect(plan.duration).toBe(segments.at(-1)!.resultEnd);
  expect(plan.videoClips.map((clip) => clip.sourceDuration)).toEqual([0.01, 0.05 - 0.03]);
  expect(plan.videoClips[1]!.startTime).toBe(0.01);
});

it('refuses altered templates, invalid edits and identity conflicts before returning a plan', () => {
  const patches = [
    { operationId: ' invalid ' },
    { operationId: 'x'.repeat(129) },
    { source: { ...fixture().source, width: 0 } },
    { video: { ...fixture().video, duration: 7 } },
    { video: { ...fixture().video, sourceStart: 1 } },
    { video: { ...fixture().video, playbackRate: 2 } },
    { video: { ...fixture().video, fadeInMs: 1 } },
    { audio: { ...fixture().audio, assetId: 'other-source' } },
    { audio: { ...fixture().audio, trackId: fixture().video.trackId } },
    { audio: { ...fixture().audio, id: fixture().video.id } },
  ];
  for (const patch of patches)
    expect(() => planReviewProjectTimeline({ ...fixture(), ...patch })).toThrow('invalid-input');
  const input = fixture();
  const cut: ReviewEdit = {
    id: 'cut',
    kind: 'cut',
    start: 1,
    end: 4,
    requestedStart: 1,
    requestedEnd: 4,
  };
  expect(() => planReviewProjectTimeline({ ...input, edits: [cut, cut] })).toThrow('invalid-input');
  expect(() =>
    planReviewProjectTimeline({
      ...input,
      edits: [cut, { ...cut, id: 'overlap', start: 3, end: 5 }],
    })
  ).toThrow();
  expect(() =>
    planReviewProjectTimeline({ ...input, edits: [{ ...cut, start: 0, end: 8 }] })
  ).toThrow('empty-result');
  const long = fixture(86400);
  expect(() =>
    planReviewProjectTimeline({
      ...long,
      edits: [
        {
          id: 'slow',
          kind: 'speed',
          start: 0,
          end: 86400,
          requestedStart: 0,
          requestedEnd: 86400,
          rate: 0.0625,
          audio: 'speed',
        },
      ],
    })
  ).toThrow('duration');
});

it('does not acquire identity or clock authority and leaves inputs intact after allocation failure', () => {
  const input = fixture();
  const before = structuredClone(input);
  const id = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('No random identity');
  });
  const now = vi.spyOn(Date, 'now').mockImplementation(() => {
    throw new Error('No wall clock');
  });
  try {
    expect(planReviewProjectTimeline(input).videoClips[0]!.id).toBe('conversion-1:video:0');
    const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(() => {
      throw new Error('Allocation failed');
    });
    try {
      expect(() => planReviewProjectTimeline(input)).toThrow('Allocation failed');
    } finally {
      clone.mockRestore();
    }
    expect(input).toEqual(before);
  } finally {
    id.mockRestore();
    now.mockRestore();
  }
});

it('projects source text once when video and original audio share immutable bytes', () => {
  const input = fixture();
  const plan = planReviewProjectTimeline(input);
  const project = createProject([...plan.videoClips, ...plan.audioClips]);
  const entry: VideoProjectTextDocument = {
    id: 'text',
    binding: {
      kind: 'source',
      assetId: input.video.assetId,
      sourceInstanceId: plan.sourceInstanceId,
    },
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          start: 1,
          end: 2,
          text: 'Text',
          originalText: 'Text',
          revision: 0,
          timingRevision: 0,
          timeDomain: 'source',
          showInVideo: true,
          alignment: 'range',
        },
      ],
    },
  };
  expect(
    projectVideoProjectTextFragment(project, entry, entry.document.fragments[0]!).ranges
  ).toEqual([{ start: 1, end: 2 }]);
});
