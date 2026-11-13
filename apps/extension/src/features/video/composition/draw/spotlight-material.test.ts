// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createSceneSpotlightMaterialOwner } from './spotlight-material';
import { createSceneSpotlightMasks, type SceneSpotlightLayer } from './spotlight';
import type { RenderResources } from '../canvas/render-resources';

vi.mock('./spotlight', () => ({
  createSceneSpotlightMasks: vi.fn(() => ({
    dim: document.createElement('canvas'),
    blur: document.createElement('canvas'),
    radius: 12,
    dispose: vi.fn(),
  })),
}));
const output = { width: 1904, height: 1072 };
const frame: SceneSpotlightLayer = {
  opening: { x: 100, y: 80, width: 400, height: 200 },
  radius: 8,
  dim: 0.6,
  blur: 12,
};
const owners: ReturnType<typeof createSceneSpotlightMaterialOwner>[] = [];
function fixture() {
  const owner = createSceneSpotlightMaterialOwner();
  owners.push(owner);
  return owner;
}
function resources(): RenderResources {
  return {
    canvas: vi.fn(() => {
      throw new Error('Unexpected direct allocation');
    }),
    bytes: vi.fn(() => ({ release: vi.fn() })),
  };
}
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.clearAllMocks();
});
it('produces unchanged mask content once and lends immutable pixels to concurrent readers', () => {
  const owner = fixture();
  const first = owner.acquire(output, [frame]);
  const second = owner.acquire({ ...output }, [structuredClone(frame)]);
  expect(second.dim).toBe(first.dim);
  expect(second.blur).toBe(first.blur);
  expect(createSceneSpotlightMasks).toHaveBeenCalledOnce();
  first.dispose();
  first.dispose();
  const allocated = vi.mocked(createSceneSpotlightMasks).mock.results[0]!.value!;
  owner.dispose();
  expect(allocated.dispose).not.toHaveBeenCalled();
  second.dispose();
  expect(allocated.dispose).toHaveBeenCalledOnce();
});
it('preserves borrowed old pixels while changed geometry uses a temporary material', () => {
  const owner = fixture();
  const first = owner.acquire(output, [frame]);
  const changed = owner.acquire(output, [{ ...frame, radius: 20 }]);
  expect(changed.dim).not.toBe(first.dim);
  changed.dispose();
  expect(
    vi.mocked(createSceneSpotlightMasks).mock.results[1]!.value!.dispose
  ).toHaveBeenCalledOnce();
  expect(
    vi.mocked(createSceneSpotlightMasks).mock.results[0]!.value!.dispose
  ).not.toHaveBeenCalled();
  const same = owner.acquire(output, [frame]);
  expect(same.dim).toBe(first.dim);
  same.dispose();
  first.dispose();
  const replacement = owner.acquire(output, [{ ...frame, radius: 20 }]);
  expect(replacement.dim).not.toBe(changed.dim);
  expect(
    vi.mocked(createSceneSpotlightMasks).mock.results[0]!.value!.dispose
  ).toHaveBeenCalledOnce();
  replacement.dispose();
});
it.each([
  { ...frame, opening: { ...frame.opening, x: 101 } },
  { ...frame, radius: 9 },
  { ...frame, dim: 0.5 },
  { ...frame, blur: 15 },
  { ...frame, arcMix: 0.5 },
  { ...frame, presence: 0.5 },
  { ...frame, protectionOpening: { ...frame.opening, width: 50 } },
  { ...frame, protectionRadius: 3 },
  { ...frame, openingClipProgress: 0.5 },
  { ...frame, clip: { rect: { ...frame.opening }, radius: 5 } },
  { ...frame, clip: { rect: { ...frame.opening }, radius: 5, outline: [{ x: 0, y: 1 }] } },
  { ...frame, projection: [1, 0, 2, 0, 1, 0, 0, 0, 1] as const },
  { ...frame, blend: { groupId: 'morph', weight: 0.5 } },
])('invalidates changed mask geometry or coverage %#', (changed) => {
  const owner = fixture();
  const first = owner.acquire(output, [frame]);
  first.dispose();
  const next = owner.acquire(output, [changed]);
  expect(next.dim).not.toBe(first.dim);
  expect(createSceneSpotlightMasks).toHaveBeenCalledTimes(2);
  next.dispose();
});
it('invalidates the output, frame order and allocator identity without crossing resource owners', () => {
  const owner = fixture(),
    firstResources = resources(),
    nextResources = resources();
  for (const [size, frames, ledger] of [
    [output, [frame], firstResources],
    [{ width: 1920, height: 1080 }, [frame], firstResources],
    [output, [frame, { ...frame, radius: 1 }], firstResources],
    [output, [{ ...frame, radius: 1 }, frame], firstResources],
    [output, [{ ...frame, radius: 1 }, frame], nextResources],
  ] as const)
    owner.acquire(size, frames, ledger).dispose();
  expect(createSceneSpotlightMasks).toHaveBeenCalledTimes(5);
});
it('does not retain a mask pair larger than the64MiB output budget', () => {
  const owner = fixture();
  const large = { width: 4096, height: 2160 };
  owner.acquire(large, [frame]).dispose();
  owner.acquire(large, [frame]).dispose();
  expect(createSceneSpotlightMasks).toHaveBeenCalledTimes(2);
  for (const result of vi.mocked(createSceneSpotlightMasks).mock.results)
    expect(result.value!.dispose).toHaveBeenCalledOnce();
});
it('preserves the previous completed material when replacement allocation fails', () => {
  const owner = fixture();
  const first = owner.acquire(output, [frame]);
  first.dispose();
  vi.mocked(createSceneSpotlightMasks).mockImplementationOnce(() => {
    throw new Error('allocation');
  });
  expect(() => owner.acquire(output, [{ ...frame, radius: 5 }])).toThrow('allocation');
  const retained = owner.acquire(output, [frame]);
  expect(retained.dim).toBe(first.dim);
  retained.dispose();
});
it('refuses new allocations after disposal and does not destroy pending readers', () => {
  const owner = fixture();
  const first = owner.acquire(output, [frame]);
  owner.dispose();
  owner.dispose();
  expect(() => owner.acquire(output, [frame])).toThrow('disposed');
  expect(createSceneSpotlightMasks).toHaveBeenCalledOnce();
  expect(
    vi.mocked(createSceneSpotlightMasks).mock.results[0]!.value!.dispose
  ).not.toHaveBeenCalled();
  first.dispose();
  expect(
    vi.mocked(createSceneSpotlightMasks).mock.results[0]!.value!.dispose
  ).toHaveBeenCalledOnce();
});
