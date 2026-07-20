import { expect, it } from 'vitest';

import { buildOfflineAudioMixResult } from './result';

it('maps the rendered buffer metadata into export audio settings', () => {
  const renderedBuffer = {
    numberOfChannels: 2,
    sampleRate: 48_000,
  } as AudioBuffer;

  expect(buildOfflineAudioMixResult(renderedBuffer)).toEqual({
    buffer: renderedBuffer,
    settings: {
      numberOfChannels: 2,
      sampleRate: 48_000,
    },
  });
});
