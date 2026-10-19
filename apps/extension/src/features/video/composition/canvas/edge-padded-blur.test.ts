import { expect, it, vi } from 'vitest';
import { drawEdgePaddedBlur } from './edge-padded-blur';
import type { RenderResources } from './render-resources';

function fixture() {
  const copy = { clearRect: vi.fn(), drawImage: vi.fn() };
  const scratch = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => copy),
  } as unknown as OffscreenCanvas;
  const source = { width: 40, height: 20 } as OffscreenCanvas;
  const filters: string[] = [];
  const context = {
    filter: 'contrast(1.2)',
    drawImage: vi.fn(() => {
      filters.push(context.filter);
    }),
  } as unknown as CanvasRenderingContext2D;
  return { copy, scratch, source, context, filters };
}

it('accepts native offscreen surfaces and replicates each edge before one Gaussian pass', () => {
  const f = fixture();
  drawEdgePaddedBlur(f.context, f.source, f.scratch, 4);
  expect([f.scratch.width, f.scratch.height]).toEqual([68, 48]);
  expect(f.copy.drawImage).toHaveBeenCalledTimes(9);
  expect(f.copy.drawImage).toHaveBeenCalledWith(f.source, 0, 0, 1, 1, 0, 0, 14, 14);
  expect(f.copy.drawImage).toHaveBeenCalledWith(f.source, 39, 19, 1, 1, 54, 34, 14, 14);
  expect(f.context.drawImage).toHaveBeenCalledWith(f.scratch, -14, -14);
  expect(f.filters).toEqual(['blur(4px)']);
  expect(f.context.filter).toBe('contrast(1.2)');
  expect(f.scratch.width).toBe(68);
});

it.each(['context', 'draw'] as const)(
  'restores destination filtering and releases a managed lease after %s failure',
  (failure) => {
    const f = fixture();
    const release = vi.fn();
    const resources = {
      canvas: vi.fn(() => ({ canvas: f.scratch, release })),
    } as unknown as RenderResources;
    if (failure === 'context') vi.mocked(f.scratch.getContext).mockReturnValue(null);
    else
      vi.mocked(f.context.drawImage).mockImplementation(() => {
        throw new Error('native draw failed');
      });
    expect(() => drawEdgePaddedBlur(f.context, f.source, null, 4, resources)).toThrow();
    expect(f.context.filter).toBe('contrast(1.2)');
    expect(release).toHaveBeenCalledOnce();
    expect(resources.canvas).toHaveBeenCalledWith('spotlight.paddedBlur', {
      width: 68,
      height: 48,
    });
    expect(f.scratch.width).toBe(68);
  }
);

it('releases an owned surface after failure and rejects a non-2d context', () => {
  const f = fixture();
  vi.mocked(f.scratch.getContext).mockReturnValue({} as never);
  vi.stubGlobal('document', { createElement: () => f.scratch });
  try {
    expect(() => drawEdgePaddedBlur(f.context, f.source, null, 4)).toThrow(
      'Spotlight compositor is unavailable.'
    );
    expect([f.scratch.width, f.scratch.height]).toEqual([0, 0]);
    expect(f.context.filter).toBe('contrast(1.2)');
  } finally {
    vi.unstubAllGlobals();
  }
});
