import { projectReviewVoiceover, anchorReviewVoiceover } from '../voiceover-edits';
import { buildReviewTimeMap } from '../timeline';
import { describe, expect, it } from 'vitest';
import {
  buildQuickEditAudioPlan,
  buildQuickEditClipEnvelope,
  planQuickEditClipPlayback,
  type QuickEditAudioPlanEntry,
  quickEditAudioSourceKey,
  iterateQuickEditActionAudioPlan,
} from './audio-plan';
import { buildReviewActionAudioPlan } from '../action-audio';
import type { QuickEditAudioClip } from './types';

it('separates project identities from bundled samples even when text IDs match', () => {
  expect(quickEditAudioSourceKey({ kind: 'project', assetId: 'key-01-v1' })).not.toBe(
    quickEditAudioSourceKey({ kind: 'bundled', sampleId: 'key-01-v1' })
  );
});

it('keeps main-time cue identity and waveform phase across fragment windows', () => {
  const plan = buildReviewActionAudioPlan({
    markers: [{ ref: { kind: 'signal', id: 'typing' }, eventType: 'typing', start: 0, end: 10 }],
    settings: [
      {
        ref: { kind: 'signal', id: 'typing' },
        enabled: true,
        presetId: 'typing-natural-v1',
        volume: 0.35,
        offset: 0,
      },
    ],
    segments: buildReviewTimeMap(10, []),
    applied: true,
  });
  const action = { plan, busGain: 0.5, offset: 2, bounds: { start: 2, end: 4 } };
  const whole = [...iterateQuickEditActionAudioPlan(action, { start: 0, end: 2 })].flat();
  const windows = [1, 0].flatMap((start) =>
    [...iterateQuickEditActionAudioPlan(action, { start, end: start + 1 })].flat()
  );
  const keyed = new Map(windows.map((entry) => [entry.clipId, entry]));
  expect([...keyed.values()].sort((a, b) => a.timelineStart - b.timelineStart)).toEqual(whole);
  expect(whole.length).toBeGreaterThan(5);
  expect(
    whole.every(
      (entry) =>
        entry.lane === 'action' && entry.source.kind === 'bundled' && entry.playbackRate === 1
    )
  ).toBe(true);
  expect(
    whole.every((entry) => entry.timelineStart >= 0 && entry.timelineStart + entry.duration <= 2)
  ).toBe(true);
  const first = whole[0]!;
  expect(first.sourceOffset).toBeGreaterThan(0);
  expect(first.fadeIn).toBeGreaterThan(0);
});

const clip = (patch: Partial<QuickEditAudioClip>): QuickEditAudioClip => ({
  id: 'a',
  assetId: 'project-asset:a',
  timelineStart: 2,
  sourceOffset: 0,
  duration: 4,
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  ...patch,
});

const entry = (patch: Partial<QuickEditAudioPlanEntry>): QuickEditAudioPlanEntry => ({
  lane: 'music',
  clipId: 'a',
  source: { kind: 'project' as const, assetId: 'project-asset:a' },
  timelineStart: 2,
  duration: 4,
  sourceOffset: 0,
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  ...patch,
});

describe('buildQuickEditAudioPlan', () => {
  it('projects both lanes and mutes into the entry volume', () => {
    expect(
      buildQuickEditAudioPlan({
        voiceover: [clip({ id: 'v', muted: true, volume: 2 })],
        music: [clip({ id: 'm', volume: 0.5 })],
      })
    ).toEqual([
      {
        lane: 'voiceover',
        clipId: 'v',
        source: { kind: 'project' as const, assetId: 'project-asset:a' },
        timelineStart: 2,
        duration: 4,
        sourceOffset: 0,
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        lane: 'music',
        clipId: 'm',
        source: { kind: 'project' as const, assetId: 'project-asset:a' },
        timelineStart: 2,
        duration: 4,
        sourceOffset: 0,
        volume: 0.5,
        fadeIn: 0,
        fadeOut: 0,
      },
    ]);
  });
});

describe('buildQuickEditClipEnvelope', () => {
  it('resumes at the matching gain from a mid-clip fade position', () => {
    expect(
      buildQuickEditClipEnvelope({ entry: entry({ fadeIn: 1 }), duration: 4, elapsed: 0.5 })
    ).toEqual([
      [0.5, 0.5],
      [1, 1],
      [4, 1],
    ]);
  });

  it('starts at full gain when the fade already finished', () => {
    expect(
      buildQuickEditClipEnvelope({
        entry: entry({ fadeIn: 1, fadeOut: 1 }),
        duration: 4,
        elapsed: 2,
      })
    ).toEqual([
      [2, 1],
      [3, 1],
      [4, 0],
    ]);
  });

  it('repeats no fade-in for a late start and keeps an unmuted tail audible', () => {
    expect(
      buildQuickEditClipEnvelope({ entry: entry({ fadeOut: 2 }), duration: 6, elapsed: 1 })
    ).toEqual([
      [1, 1],
      [4, 1],
      [6, 0],
    ]);
  });

  it('keeps the authored fade phase across cut slices and speed changes', () => {
    expect(
      buildQuickEditClipEnvelope({
        entry: entry({ fadeIn: 1, fadeOut: 1, fadePhase: { offset: 0, duration: 4 } }),
        duration: 1,
        elapsed: 0,
      })
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(
      buildQuickEditClipEnvelope({
        entry: entry({ fadeIn: 1, fadeOut: 1, fadePhase: { offset: 2, duration: 4 } }),
        duration: 2,
        elapsed: 0,
      })
    ).toEqual([
      [0, 1],
      [1, 1],
      [2, 0],
    ]);
    expect(
      planQuickEditClipPlayback({
        entry: entry({
          duration: 1,
          sourceOffset: 4,
          playbackRate: 2,
          fadePhase: { offset: 1, duration: 4 },
        }),
        outputTime: 2.25,
        audioNow: 10,
      })
    ).toMatchObject({ offset: 4.5, duration: 1.5, playbackRate: 2 });
  });
});

describe('planQuickEditClipPlayback', () => {
  it('schedules a running clip with an asset offset and matching envelope', () => {
    const schedule = planQuickEditClipPlayback({
      entry: entry({ sourceOffset: 1, fadeIn: 1 }),
      outputTime: 3,
      audioNow: 100,
    });
    expect(schedule).toEqual({
      when: 100,
      offset: 2,
      duration: 3,
      envelope: [
        [100, 1],
        [103, 1],
      ],
    });
  });

  it('schedules a future clip with lead-in', () => {
    const schedule = planQuickEditClipPlayback({
      entry: entry({ timelineStart: 6, fadeIn: 1 }),
      outputTime: 2,
      audioNow: 10,
    });
    expect(schedule).toEqual({
      when: 14,
      offset: 0,
      duration: 4,
      envelope: [
        [14, 0],
        [15, 1],
        [18, 1],
      ],
    });
  });

  it('returns nothing for ended and muted clips', () => {
    expect(
      planQuickEditClipPlayback({ entry: entry({ timelineStart: 0 }), outputTime: 4, audioNow: 1 })
    ).toBeNull();
    expect(
      planQuickEditClipPlayback({ entry: entry({ volume: 0 }), outputTime: 3, audioNow: 1 })
    ).toBeNull();
  });
});

it.each([0.5, 2])(
  'schedules own VoiceOver tempo %sx identically for preview/export and seek',
  (tempo) => {
    const map = buildReviewTimeMap(24, [
      {
        id: 'speed',
        kind: 'speed',
        start: 0,
        end: 8,
        requestedStart: 0,
        requestedEnd: 8,
        rate: 4,
        audio: 'speed',
      },
    ]);
    const voice = anchorReviewVoiceover(clip({ timelineStart: 0, duration: 4, tempo }), map);
    const plan = buildQuickEditAudioPlan({
      voiceover: projectReviewVoiceover([voice], map),
      music: [clip({ id: 'music' })],
    });
    expect(plan[0]).toMatchObject({ duration: 4 / tempo, playbackRate: tempo });
    expect(plan[1]).toMatchObject({ duration: 4, timelineStart: 2 });
    expect(plan[1]).not.toHaveProperty('playbackRate');
    const schedule = planQuickEditClipPlayback({ entry: plan[0]!, outputTime: 0.5, audioNow: 100 });
    expect(schedule).toMatchObject({
      when: 100,
      offset: 0.5 * tempo,
      duration: 4 - 0.5 * tempo,
      playbackRate: tempo,
    });
  }
);

it.each([undefined, { offset: 0, duration: 4 }, { offset: 2, duration: 4 }])(
  'preserves zero-fade gain through the end of native audio or a voiceover slice %j',
  (fadePhase) => {
    const duration = fadePhase?.offset ? 2 : 4;
    for (const elapsed of [0, duration / 2, duration - 0.01]) {
      const envelope = buildQuickEditClipEnvelope({
        entry: entry({ lane: 'voiceover', volume: 0.7, ...(fadePhase ? { fadePhase } : {}) }),
        duration,
        elapsed,
      });
      expect(envelope).toEqual([
        [elapsed, 0.7],
        [duration, 0.7],
      ]);
    }
  }
);

it('schedules ordinary projected voiceover with its native offset and rate', () => {
  const entry = {
    id: 'accepted:part',
    assetId: 'project-asset:accepted',
    timelineStart: 3,
    duration: 1,
    sourceOffset: 2,
    playbackRate: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  const plan = buildQuickEditAudioPlan({ voiceover: [entry], music: [] });
  expect(plan).toEqual([
    {
      lane: 'voiceover',
      clipId: 'accepted:part',
      source: { kind: 'project' as const, assetId: 'project-asset:accepted' },
      timelineStart: 3,
      duration: 1,
      sourceOffset: 2,
      playbackRate: 2,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    },
  ]);
  expect(
    planQuickEditClipPlayback({ entry: plan[0]!, outputTime: 3.25, audioNow: 100 })
  ).toMatchObject({ offset: 2.5, duration: 1.5, playbackRate: 2 });
});

it('does not interpret retained clip transcript replacements as another playback source', () => {
  const source = clip({
    transcript: {
      version: 1,
      phrases: [],
      replacements: [
        {
          id: 'old',
          phraseId: 'p',
          start: 0,
          end: 2,
          duration: 1,
          assetId: 'project-asset:old',
          revision: 0,
          text: 'Old',
          textSignature: 'sig',
          profile: { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' },
        },
      ],
    },
  });
  const before = structuredClone(source);
  const plan = buildQuickEditAudioPlan({ voiceover: [source], music: [] });
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    lane: 'voiceover',
    clipId: source.id,
    source: { kind: 'project', assetId: source.assetId },
    duration: source.duration,
  });
  expect(source).toEqual(before);
});

it('retains source-phase fade crossings after tempo changes and midclip resume', () => {
  const points = buildQuickEditClipEnvelope({
    entry: entry({
      volume: 0.5,
      fadeIn: 6,
      fadeOut: 4,
      playbackRate: 2,
      fadePhase: { offset: 1, duration: 8 },
    }),
    duration: 3.5,
    elapsed: 0.5,
  });
  expect(points.map(([time]) => time)).toEqual([0.5, 1.5, 1.9, 2.5, 3.5]);
  expect(points[2]?.[1]).toBeCloseTo(0.4, 12);
});
