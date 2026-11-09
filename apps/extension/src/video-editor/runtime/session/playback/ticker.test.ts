import { expect, it } from 'vitest';

import { resolvePlaybackTickTime } from './ticker';
import type { PlaybackRefState } from '../../../interaction/playback/types';

function createPlaybackRef(state: PlaybackRefState) {
  return { current: state };
}

function verifiesSyntheticPlaybackTime() {
  const playbackRef = createPlaybackRef({
    initialTime: 6,
    sessionStart: 6,
    startedAt: 0,
  });

  expect(resolvePlaybackTickTime(playbackRef, 120)).toBe(6.12);
}

function verifiesSyntheticPlaybackTimeAfterSeekRebase() {
  const playbackRef = createPlaybackRef({
    initialTime: 6.4,
    sessionStart: 6,
    startedAt: 200,
  });

  expect(resolvePlaybackTickTime(playbackRef, 450)).toBe(6.65);
}

it('advances playback time from the synthetic transport clock', verifiesSyntheticPlaybackTime);
it(
  'keeps advancing from the last seek-aligned session anchor',
  verifiesSyntheticPlaybackTimeAfterSeekRebase
);

it('holds the session start when a frame timestamp predates its performance clock anchor', () => {
  const playbackRef = createPlaybackRef({ initialTime: 11.5, sessionStart: 11.5, startedAt: 1000 });
  expect(resolvePlaybackTickTime(playbackRef, 984)).toBe(11.5);
  expect(resolvePlaybackTickTime(playbackRef, 1000)).toBe(11.5);
  expect(resolvePlaybackTickTime(playbackRef, 1017)).toBeCloseTo(11.517, 9);
});
