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
