import { expect, it, vi } from 'vitest';
import { calculateSpatialRenderAllocations } from './spatial-render-allocation';
import { createPreviewRenderResources } from './preview-render-resources';

it.each([false, true])(
  'admits alternating plane and larger overlay uploads with exact level costs, halfFloat=%s',
  (halfFloat) => {
    const input = {
      output: { width: 7, height: 5 },
      plane: { width: 41, height: 11 },
      overlay: { width: 13, height: 61 },
      halfFloat,
    };
    const allocations = calculateSpatialRenderAllocations(input);
    expect(allocations.find(({ role }) => role === 'spatial-texture-0')!.bytes).toBe(13 * 61 * 4);
    for (const [level, area] of [793, 217, 64, 16, 4, 2, 1, 1].entries()) {
      expect(allocations.find(({ role }) => role === `spatial-texture-${level}`)!.bytes).toBe(
        area * (level > 0 && halfFloat ? 8 : 4)
      );
    }
    const budget = allocations.reduce((sum, item) => sum + item.bytes, 0);
    const resources = createPreviewRenderResources({
      maximumManagedBytes: budget,
      maximumCanvases: 3,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          getContext: () => ({ reset: vi.fn() }),
        }) as unknown as HTMLCanvasElement,
    });
    const held: { release(): void }[] = [];
    const textures = new Map<number, { release(): void }>();
    try {
      for (const [role, size] of [
        ['plane', input.plane],
        ['overlay', input.overlay],
        ['exposure', input.output],
      ] as const)
        held.push(resources.canvas(`spatial-${role}`, size));
      for (const allocation of allocations.filter(
        ({ role, canvases }) => !canvases && !role.startsWith('spatial-texture-')
      ))
        held.push(resources.bytes(allocation.role, allocation.bytes));
      for (const source of [input.plane, input.overlay, input.plane]) {
        let { width, height } = source;
        for (let level = 0; level < 8; level++) {
          textures.get(level)?.release();
          textures.set(
            level,
            resources.bytes('spatial-texture', width * height * (level > 0 && halfFloat ? 8 : 4))
          );
          width = Math.max(1, Math.ceil(width / 2));
          height = Math.max(1, Math.ceil(height / 2));
        }
      }
      expect(resources.counters.peakManagedBytes).toBe(budget);
    } finally {
      for (const texture of textures.values()) texture.release();
      for (const lease of held) lease.release();
      resources.dispose();
    }
    expect(resources.counters.managedBytes).toBe(0);
  }
);

it('retains larger old texture roles without combining crossed source rectangles', () => {
  const allocations = calculateSpatialRenderAllocations({
    output: { width: 7, height: 5 },
    plane: { width: 41, height: 11 },
    overlay: { width: 13, height: 61 },
    halfFloat: true,
    retained: [{ role: 'spatial-texture-1', bytes: 9000, canvases: 0 }],
  });
  expect(allocations.find(({ role }) => role === 'spatial-texture-0')!.bytes).toBe(13 * 61 * 4);
  expect(allocations.find(({ role }) => role === 'spatial-texture-1')!.bytes).toBe(9000);
  expect(allocations.filter(({ role }) => role === 'spatial-texture-1')).toHaveLength(1);
});
