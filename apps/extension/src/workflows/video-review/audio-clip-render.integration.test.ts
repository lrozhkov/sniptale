import { afterEach, beforeEach, it, vi } from 'vitest';
import { Pcm, createParitySource, expectAudioClipWindows } from './audio-clip-parity.test-support';

beforeEach(() => vi.stubGlobal('AudioBuffer', Pcm));
afterEach(() => vi.unstubAllGlobals());

it('preserves bitwise streaming parity for late windows in a 170-second native-rate stereo source', async () => {
  const source = createParitySource({
    sampleRate: 44100,
    sourceOffset: 70.25,
    duration: 5,
    rate: 1.5,
    sourceSeconds: 170,
  });
  await expectAudioClipWindows({
    source,
    clip: {
      lane: 'voiceover',
      clipId: 'voice',
      source: { kind: 'project' as const, assetId: 'voice' },
      timelineStart: 0,
      sourceOffset: 70.25,
      duration: 5,
      playbackRate: 1.5,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    },
    windows: [
      [3.1, 3.7],
      [3.7, 4.5],
    ],
  });
}, 30_000);
