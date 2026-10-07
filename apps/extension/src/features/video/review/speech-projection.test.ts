import { describe, expect, it } from 'vitest';
import { buildQuickEditAudioPlan } from './advanced/audio-plan';
import type { QuickEditAudioClip } from './advanced/types';
import { reviewSpeechTextSignature } from './speech-transcript';
import {
  anchorReviewVoiceover,
  moveReviewVoiceover,
  projectReviewVoiceover,
  trimReviewVoiceover,
} from './voiceover-edits';
import { buildReviewTimeMap } from './timeline';

const profile = { modelId: 'tts', voiceId: 'alloy', responseFormat: 'mp3' as const };
const clip = (): QuickEditAudioClip => ({
  id: 'voice',
  assetId: 'project-asset:original',
  timelineStart: 0,
  sourceOffset: 10,
  duration: 10,
  volume: 1,
  muted: false,
  fadeIn: 2,
  fadeOut: 2,
  transcript: {
    version: 1,
    phrases: [],
    replacements: [
      {
        id: 'take',
        assetId: 'project-asset:generated',
        start: 13,
        end: 17,
        duration: 2,
        text: 'Speech',
        phraseId: 'p',
        revision: 0,
        profile,
        textSignature: reviewSpeechTextSignature('Speech', profile),
      },
    ],
  },
});
const plan = (voice: QuickEditAudioClip[]) =>
  buildQuickEditAudioPlan({ voiceover: voice, music: [] });
const schedule = (voice: QuickEditAudioClip[]) =>
  plan(voice).map(({ assetId, sourceOffset, timelineStart, duration, playbackRate }) => ({
    assetId,
    sourceOffset,
    timelineStart,
    duration,
    playbackRate: playbackRate ?? 1,
  }));

describe('native speech replacement projection shared by preview and export', () => {
  it('preserves both original sides and leaves the shorter result tail silent without overlay', () => {
    expect(schedule([clip()])).toEqual([
      {
        assetId: 'project-asset:original',
        sourceOffset: 10,
        timelineStart: 0,
        duration: 3,
        playbackRate: 1,
      },
      {
        assetId: 'project-asset:generated',
        sourceOffset: 0,
        timelineStart: 3,
        duration: 2,
        playbackRate: 1,
      },
      {
        assetId: 'project-asset:original',
        sourceOffset: 17,
        timelineStart: 7,
        duration: 3,
        playbackRate: 1,
      },
    ]);
    expect(plan([clip()]).map((entry) => entry.fadePhase)).toEqual([
      { offset: 0, duration: 10 },
      { offset: 3, duration: 10 },
      { offset: 7, duration: 10 },
    ]);
  });

  it('keeps native binding under move and trim, including trim through a generated phrase', () => {
    const map = buildReviewTimeMap(30, []);
    const anchored = anchorReviewVoiceover(clip(), map);
    const moved = moveReviewVoiceover(anchored, 5, 30, map);
    expect(
      schedule(projectReviewVoiceover([moved], map)).map((entry) => entry.timelineStart)
    ).toEqual([5, 8, 12]);
    const trimmed = trimReviewVoiceover(anchored, 'start', 4, 30, 30, map);
    expect(schedule(projectReviewVoiceover([trimmed], map))).toEqual([
      {
        assetId: 'project-asset:generated',
        sourceOffset: 1,
        timelineStart: 4,
        duration: 1,
        playbackRate: 1,
      },
      {
        assetId: 'project-asset:original',
        sourceOffset: 17,
        timelineStart: 7,
        duration: 3,
        playbackRate: 1,
      },
    ]);
  });

  it('uses clip tempo and restores identical samples when a Cut is removed', () => {
    const uncut = buildReviewTimeMap(20, []);
    const anchored = anchorReviewVoiceover(clip(), uncut);
    const cut = buildReviewTimeMap(20, [
      { id: 'cut', kind: 'cut', start: 4, end: 6, requestedStart: 4, requestedEnd: 6 },
    ]);
    expect(schedule(projectReviewVoiceover([anchored], cut))).toEqual([
      {
        assetId: 'project-asset:original',
        sourceOffset: 10,
        timelineStart: 0,
        duration: 3,
        playbackRate: 1,
      },
      {
        assetId: 'project-asset:generated',
        sourceOffset: 0,
        timelineStart: 3,
        duration: 1,
        playbackRate: 1,
      },
      {
        assetId: 'project-asset:original',
        sourceOffset: 17,
        timelineStart: 5,
        duration: 3,
        playbackRate: 1,
      },
    ]);
    expect(schedule(projectReviewVoiceover([anchored], uncut))).toEqual(schedule([clip()]));
    const speed = buildReviewTimeMap(20, [
      {
        id: 'speed',
        kind: 'speed',
        start: 0,
        end: 10,
        requestedStart: 0,
        requestedEnd: 10,
        rate: 2,
        audio: 'speed',
      },
    ]);
    expect(schedule(projectReviewVoiceover([anchored], speed))).toEqual(schedule([clip()]));
    expect(
      schedule(projectReviewVoiceover([{ ...anchored, tempo: 2 }], uncut)).map((entry) => [
        entry.timelineStart,
        entry.duration,
        entry.playbackRate,
      ])
    ).toEqual([
      [0, 1.5, 2],
      [1.5, 1, 2],
      [3.5, 1.5, 2],
    ]);
  });
});
