// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createNativeGpuPreviewMaterials } from './gpu-preview-materials';

const owners: ReturnType<typeof createNativeGpuPreviewMaterials>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
});
function fixture() {
  const materials = createNativeGpuPreviewMaterials();
  owners.push(materials);
  const bounds = { x: -8, y: -12, width: 32, height: 24 };
  const paint = vi.fn((context: CanvasRenderingContext2D) => context.fillRect(0, 0, 2, 2));
  return { materials, bounds, paint };
}
function canvas(layer: { source: unknown }) {
  if (!(layer.source instanceof HTMLCanvasElement)) throw new Error('Expected mask canvas.');
  return layer.source;
}
it('shares immutable matching mask pixels and cache revision until owner disposal', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'coverage', f.paint);
  const second = f.materials.sourceMask(document, { ...f.bounds }, 'coverage', f.paint);
  expect(second.layer.source).toBe(first.layer.source);
  expect(second.layer.cache).toEqual(first.layer.cache);
  expect(first.layer.cache?.key).toBe('native-source-mask');
  expect(first.layer.rect).toEqual(f.bounds);
  expect(canvas(first.layer).width).toBe(32);
  expect(f.paint).toHaveBeenCalledTimes(1);
  first.release();
  first.release();
  second.release();
  expect(canvas(first.layer).width).toBe(32);
  f.materials.dispose();
  expect(canvas(first.layer).width).toBe(0);
});
it('uses request-owned uncached pixels for a different key while the mask is borrowed', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  const fallback = f.materials.sourceMask(document, f.bounds, 'second', f.paint);
  expect(fallback.layer.source).not.toBe(first.layer.source);
  expect(fallback.layer.cache).toBeUndefined();
  expect(canvas(first.layer).width).toBe(32);
  fallback.release();
  fallback.release();
  expect(canvas(fallback.layer).width).toBe(0);
  const hit = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  expect(hit.layer.source).toBe(first.layer.source);
  first.release();
  hit.release();
});
it('replaces idle coverage atomically and advances persistent revisions', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  first.release();
  const second = f.materials.sourceMask(document, f.bounds, 'second', f.paint);
  expect(second.layer.source).not.toBe(first.layer.source);
  expect(canvas(first.layer).width).toBe(0);
  expect(Number(second.layer.cache?.revision)).toBeGreaterThan(Number(first.layer.cache?.revision));
  second.release();
});
it('keeps the completed idle entry when replacement painting fails', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  first.release();
  let failed: HTMLCanvasElement | undefined;
  expect(() =>
    f.materials.sourceMask(document, f.bounds, 'second', (context) => {
      failed = context.canvas;
      throw new Error('paint failed');
    })
  ).toThrow('paint failed');
  expect(failed?.width).toBe(0);
  const hit = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  expect(hit.layer.source).toBe(first.layer.source);
  expect(hit.layer.cache).toEqual(first.layer.cache);
  expect(f.paint).toHaveBeenCalledTimes(1);
  hit.release();
});
it('does not reuse coverage across changed bounds or owner documents', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'same', f.paint);
  first.release();
  const moved = f.materials.sourceMask(document, { ...f.bounds, x: 1 }, 'same', f.paint);
  expect(moved.layer.source).not.toBe(first.layer.source);
  moved.release();
  const otherDocument = document.implementation.createHTMLDocument();
  const other = f.materials.sourceMask(otherDocument, { ...f.bounds, x: 1 }, 'same', f.paint);
  expect(other.layer.source).not.toBe(moved.layer.source);
  other.release();
});
it('retains both shared borrows through disposal and rejects subsequent requests', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'same', f.paint);
  const second = f.materials.sourceMask(document, f.bounds, 'same', f.paint);
  f.materials.dispose();
  f.materials.dispose();
  expect(() => f.materials.sourceMask(document, f.bounds, 'same', f.paint)).toThrow();
  expect(canvas(first.layer).width).toBe(32);
  first.release();
  first.release();
  expect(canvas(first.layer).width).toBe(32);
  second.release();
  expect(canvas(first.layer).width).toBe(0);
});
it('keeps busy fallback pixels alive through owner disposal until their own release', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  const fallback = f.materials.sourceMask(document, f.bounds, 'second', f.paint);
  f.materials.dispose();
  first.release();
  expect(canvas(fallback.layer).width).toBe(32);
  fallback.release();
  expect(canvas(fallback.layer).width).toBe(0);
});
it('snapshots caller bounds so later mutation cannot change retained coverage', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'same', f.paint);
  f.bounds.x = 99;
  expect(first.layer.rect.x).toBe(-8);
  const other = f.materials.sourceMask(document, f.bounds, 'same', f.paint);
  expect(other.layer.source).not.toBe(first.layer.source);
  first.release();
  other.release();
});

it('clears a failed allocation without losing completed idle coverage', () => {
  const f = fixture();
  const first = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  first.release();
  const failed: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(function (
    this: HTMLCanvasElement
  ) {
    failed.push(this);
    return null;
  });
  expect(() => f.materials.sourceMask(document, f.bounds, 'second', f.paint)).toThrow();
  expect(failed[0]?.width).toBe(0);
  const hit = f.materials.sourceMask(document, f.bounds, 'first', f.paint);
  expect(hit.layer.source).toBe(first.layer.source);
  hit.release();
});
