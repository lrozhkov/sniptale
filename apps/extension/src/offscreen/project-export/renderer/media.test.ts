import { describe, expect, it, vi } from 'vitest';
import { VideoMediaFitMode } from '../../../features/video/project/types';
import { drawFittedMediaFrame } from './media';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('project-export-renderer-media', () => {
  it('passes through invalid and stretch dimensions without clipping', () => {
    const context = createContext();
    const renderer = vi.fn();

    drawFittedMediaFrame(context, 0, 100, 1, 2, 3, 4, VideoMediaFitMode.CONTAIN, renderer);
    drawFittedMediaFrame(context, 100, 100, 5, 6, 7, 8, VideoMediaFitMode.STRETCH, renderer);

    expect(renderer).toHaveBeenNthCalledWith(1, 1, 2, 3, 4);
    expect(renderer).toHaveBeenNthCalledWith(2, 5, 6, 7, 8);
    expect(context.save).not.toHaveBeenCalled();
  });

  it('uses the shared passthrough behavior for explicit source-size fit modes', () => {
    const context = createContext();
    const renderer = vi.fn();

    drawFittedMediaFrame(context, 100, 100, 5, 6, 7, 8, VideoMediaFitMode.SOURCE_100, renderer);

    expect(renderer).toHaveBeenCalledWith(5, 6, 7, 8);
    expect(context.save).not.toHaveBeenCalled();
  });

  it('clips cover mode and centers contain mode', () => {
    const context = createContext();
    const renderer = vi.fn();

    drawFittedMediaFrame(context, 200, 100, 0, 0, 100, 100, VideoMediaFitMode.COVER, renderer);
    drawFittedMediaFrame(context, 100, 100, 10, 20, 200, 100, VideoMediaFitMode.CONTAIN, renderer);

    expect(context.save).toHaveBeenCalledOnce();
    expect(context.clip).toHaveBeenCalledOnce();
    expect(renderer).toHaveBeenNthCalledWith(1, -50, 0, 200, 100);
    expect(renderer).toHaveBeenNthCalledWith(2, 60, 20, 100, 100);
  });
});
