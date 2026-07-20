import { describe, expect, it, vi } from 'vitest';

import type { PreviewStageImportHandlers, VideoEditorImportDispatchResult } from './insertion';

describe('video editor insertion contract', () => {
  it('accepts preview adapters with explicit placement', async () => {
    const handlers: PreviewStageImportHandlers = {
      audio: vi.fn(),
      image: vi.fn(async () => undefined),
      video: vi.fn(),
    };

    await handlers.image(new File([], 'image.png'), {
      startTime: 12,
      trackId: 'track-1',
    });

    expect(handlers.image).toHaveBeenCalledWith(expect.any(File), {
      startTime: 12,
      trackId: 'track-1',
    });
  });

  it('keeps unsupported classification distinct from dispatched imports', () => {
    const result: VideoEditorImportDispatchResult = {
      status: 'unsupported',
      reason: 'unsupported-media-type',
    };

    expect(result).toEqual({
      status: 'unsupported',
      reason: 'unsupported-media-type',
    });
  });
});
