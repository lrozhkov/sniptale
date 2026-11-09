import { expect, it, vi } from 'vitest';

import { resolveExportEffectDrawState } from './frame-effects';

it('reuses the draw state for every contribution at the same render time', () => {
  const states = new Map();
  const first = resolveExportEffectDrawState(states, 1.5);
  const second = resolveExportEffectDrawState(states, 1.5);
  const third = resolveExportEffectDrawState(states, 2);

  expect(second).toBe(first);
  expect(third).not.toBe(first);
  expect(states).toEqual(
    new Map([
      [1.5, first],
      [2, third],
    ])
  );
});

const mocks = vi.hoisted(() => ({ buffer: vi.fn(), draw: vi.fn() }));
vi.mock('../../../features/video/composition/canvas/pass-buffer', () => ({
  createVideoCompositionPassBuffer: mocks.buffer,
}));
vi.mock('../../../features/video/composition/draw', async (original) => ({
  ...(await original<typeof import('../../../features/video/composition/draw')>()),
  drawTransitionOverlay: mocks.draw,
}));
it.each(['success', 'prepare-failure', 'reserve-failure'] as const)(
  'uses only sharp ROI buffers and releases after %s',
  async (mode) => {
    const { drawExportTransitionOverlayPasses } = await import('./frame-effects');
    const context = {} as CanvasRenderingContext2D,
      bufferContext = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
    const dispose = vi.fn(),
      flush = vi.fn(),
      drawPass = vi.fn((_alpha: number, paint: (ctx: CanvasRenderingContext2D) => void) =>
        paint(bufferContext)
      );
    mocks.buffer.mockReturnValue({ context: bufferContext, dispose, flush, drawPass });
    mocks.draw.mockClear();
    const releases: ReturnType<typeof vi.fn>[] = [];
    const reserveRaster = vi.fn(() => {
      if (mode === 'reserve-failure' && releases.length === 1) throw new Error('budget refused');
      const release = vi.fn();
      releases.push(release);
      return release;
    });
    const prepareVisualPass = vi.fn(async () => {
      if (mode === 'prepare-failure') throw new Error('prepare failed');
    });
    const args = [
      context,
      [
        {
          time: 1,
          alpha: 0.4,
          transitionOverlays: [
            { kind: 'fill', transitionId: 'a' },
            { kind: 'fill', transitionId: 'b' },
          ],
        },
        { time: 2, alpha: 0.6 },
      ],
      { width: 1920, height: 1080 },
      { prepareVisualPass, framesByTime: new Map() },
      {
        size: { width: 40, height: 30 },
        transform: [2, 0, -20, 0, 2, -10, 0, 0, 1],
        reserveRaster,
      },
    ] as unknown as Parameters<typeof drawExportTransitionOverlayPasses>;
    const result = drawExportTransitionOverlayPasses(...args);
    if (mode === 'success') {
      await result;
      expect(mocks.buffer).toHaveBeenLastCalledWith(
        expect.objectContaining({
          bufferWidth: 40,
          bufferHeight: 30,
          drawWidth: 40,
          drawHeight: 30,
        })
      );
      expect(bufferContext.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, -20, -10);
      expect(drawPass).toHaveBeenCalledOnce();
      expect(drawPass.mock.calls[0]![0]).toBe(0.4);
      expect(mocks.draw).toHaveBeenCalledTimes(2);
      expect(
        mocks.draw.mock.calls.every((call) => call[2] === 1920 && call[3] === 1080 && call[4] === 1)
      ).toBe(true);
      expect(flush).toHaveBeenCalledOnce();
    } else
      await expect(result).rejects.toThrow(
        mode === 'reserve-failure' ? 'budget refused' : 'prepare failed'
      );
    for (const release of releases) expect(release).toHaveBeenCalledOnce();
    if (mode !== 'reserve-failure') expect(dispose).toHaveBeenCalledOnce();
  }
);
