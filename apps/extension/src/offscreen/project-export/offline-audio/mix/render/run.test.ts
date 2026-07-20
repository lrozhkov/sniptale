import { expect, it, vi } from 'vitest';

import { renderOfflineAudioMix } from './run';

vi.mock('../../clip-audio/index', () => ({
  collectRenderableAudioClips: () => [],
  decodeClipAudioBuffer: vi.fn(),
}));

vi.mock('../schedule', () => ({
  scheduleOfflineAudioClipMix: vi.fn(),
}));

it('returns null when the project has no renderable audio clips', async () => {
  const result = await renderOfflineAudioMix({
    duration: 1,
  } as never);

  expect(result).toBeNull();
});
