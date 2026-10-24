import { expect, it } from 'vitest';
import { fixture } from './project-conversion.test-support';
import { planReviewProjectConversion } from './project-conversion';
import { getClipAudioGain } from '../project/timeline/presentation.gain';

it.each(['track', 'master'] as const)(
  'retains %s silence as a reversible Native audio-track state',
  (kind) => {
    const input = fixture();
    input.document.advancedContent.audio.original = { volume: 0.7, muted: kind === 'master' };
    input.ui.tracks.originalAudio = kind !== 'track';
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const audio = result.project.clips.filter((clip) => clip.type === 'AUDIO');
    expect(audio.length).toBeGreaterThan(0);
    for (const clip of audio) {
      expect(result.project.tracks.find((track) => track.id === clip.trackId)?.visible).toBe(false);
      expect(clip.muted).toBe(false);
      expect(getClipAudioGain(clip, clip.startTime + 0.5)).toBeCloseTo(0.7, 12);
    }
    expect(input).toEqual(before);
  }
);

it('retains deliberate speed-segment mute independently of the disabled original track', () => {
  const input = fixture();
  input.ui.tracks.originalAudio = false;
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 1,
    end: 2,
    requestedStart: 1,
    requestedEnd: 2,
    rate: 2,
    audio: 'mute',
  });
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const clips = result.project.clips.filter((clip) => clip.type === 'AUDIO');
  expect(clips.find((clip) => clip.sourceStart === 1)?.muted).toBe(true);
  expect(clips.filter((clip) => clip.sourceStart !== 1).every((clip) => !clip.muted)).toBe(true);
});
