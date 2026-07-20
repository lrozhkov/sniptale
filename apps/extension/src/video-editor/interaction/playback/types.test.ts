import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { PlaybackHandlers, PlaybackPreviewRuntime } from './types';
import type { VideoEditorPreviewPrepareRequest } from '../../contracts/preview-runtime';

describe('video editor playback contracts', () => {
  it('keeps playback handlers as an explicit interaction surface', () => {
    const handlers = {
      clearPlacementMode: vi.fn(),
      deleteActionEvent: vi.fn(),
      deleteClip: vi.fn(),
      deleteCursorSample: vi.fn(),
      deleteMotionRegion: vi.fn(),
      deleteObjectTrack: vi.fn(),
      setCurrentTime: vi.fn(),
      setPlaying: vi.fn(),
      splitClipAt: vi.fn(),
      updateActionEventDetails: vi.fn(),
      updateClipTransform: vi.fn(),
      updateMotionRegion: vi.fn(),
    } satisfies PlaybackHandlers;

    handlers.setPlaying(true);
    handlers.updateClipTransform('clip-1', { x: 12 });

    expect(handlers.setPlaying).toHaveBeenCalledWith(true);
    expect(handlers.updateClipTransform).toHaveBeenCalledWith('clip-1', { x: 12 });
  });

  it('keeps playback preparer requests independent of runtime session state', () => {
    expectTypeOf<
      Parameters<PlaybackPreviewRuntime['prepare']>[0]
    >().toEqualTypeOf<VideoEditorPreviewPrepareRequest>();
  });
});
