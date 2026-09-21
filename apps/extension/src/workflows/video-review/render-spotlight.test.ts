import { afterEach, expect, it, vi } from 'vitest';
import { drawReviewSpotlight } from './render-spotlight';

afterEach(() => vi.unstubAllGlobals());
it('copies the composed scene before blur and clips only the outside with even-odd fill', () => {
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(public path: string) {}
    }
  );
  const events: string[] = [];
  const context = {
    save: () => events.push('save'),
    restore: () => events.push('restore'),
    clip: vi.fn(() => events.push('clip')),
    drawImage: () => events.push('blur'),
    fillRect: () => events.push('dim'),
    filter: 'none',
    fillStyle: '',
  };
  const copy = { clearRect: vi.fn(), drawImage: () => events.push('snapshot') };
  const scratch = { width: 100, height: 80, getContext: () => copy };
  drawReviewSpotlight(
    context as unknown as CanvasRenderingContext2D,
    { width: 100, height: 80 } as HTMLCanvasElement,
    scratch as unknown as HTMLCanvasElement,
    { opening: { x: 25, y: 20, width: 50, height: 40 }, radius: 4, dim: 0.3, blur: 6 }
  );
  expect(events).toEqual(['snapshot', 'save', 'clip', 'blur', 'dim', 'restore']);
  expect(context.clip.mock.calls[0]).toMatchObject([expect.anything(), 'evenodd']);
  expect(context.filter).toBe('none');
});
