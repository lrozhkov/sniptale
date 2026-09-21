import { describe, expect, it } from 'vitest';
import {
  buildQuickEditAudioPlan,
  buildQuickEditClipEnvelope,
  planQuickEditClipPlayback,
  type QuickEditAudioPlanEntry,
} from './audio-plan';
import type { QuickEditAudioClip } from './types';

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
  assetId: 'project-asset:a',
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
        assetId: 'project-asset:a',
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
        assetId: 'project-asset:a',
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
      [4, 0],
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
        [103, 0],
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
        [18, 0],
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
