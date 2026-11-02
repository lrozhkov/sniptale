// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import { createReviewSpatialSession } from './spatial-render-session';
import { calculateSpatialRenderAllocations } from './spatial-render-allocation';

const create = vi.hoisted(() =>
  vi.fn<
    typeof import('../../features/video/composition/canvas/spatial-renderer').createReviewSpatialRenderer
  >()
);
vi.mock('../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: create,
}));
function rawRenderer() {
  return {
    validateSizes: vi.fn<ReviewSpatialRenderer['validateSizes']>(),
    surface: vi.fn<ReviewSpatialRenderer['surface']>(),
    draw: vi.fn<ReviewSpatialRenderer['draw']>(),
    dispose: vi.fn<ReviewSpatialRenderer['dispose']>(),
  };
}
let raw: ReturnType<typeof rawRenderer>;
const owners: ReturnType<typeof createReviewSpatialSession>[] = [];
const context = { clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
beforeEach(() => {
  raw = rawRenderer();
  create.mockReset().mockReturnValue(raw);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
});
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
});
function session(onLost?: () => void) {
  const owner = createReviewSpatialSession(onLost);
  owners.push(owner);
  return owner;
}
function manager() {
  return create.mock.lastCall![1];
}
function request(width: number, height: number): Parameters<ReviewSpatialRenderer['draw']>[1] {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  return {
    source,
    sourceRect: { x: 0, y: 0, width, height },
    output: { width, height },
    base: { x: 0, y: 0, width, height },
    target: { x: 0, y: 0, width, height },
    frame: {
      rotation: [0, 0, 0, 1],
      perspective: 0.5,
      windowMotion: 1,
      lockBackground: true,
      focus: [],
    },
  };
}

it('supplies one private manager and closes all its reservations exactly once', () => {
  const owner = session();
  expect(create).toHaveBeenCalledOnce();
  const allocation = manager();
  const reservation = allocation.bytes('owner-test', 132);
  expect(owner.resourceCounters.managedBytes).toBe(132);
  owner.dispose();
  owner.dispose();
  reservation.release();
  expect(owner.resourceCounters.managedBytes).toBe(0);
  expect(raw.dispose).toHaveBeenCalledOnce();
  expect(() => allocation.bytes('late', 1)).toThrow('resource allocation failed');
  expect(() => owner.surface('plane', 1, 1)).toThrow('context was lost');
});

it('admits independent surface roles before the GPU adapter asks for each backing', () => {
  const owner = session();
  raw.surface.mockImplementation((kind, width, height) =>
    manager().canvas(kind, { width, height })
  );
  const first = owner.surface('plane', 300, 20);
  const overlay = owner.surface('overlay', 20, 300);
  const exposure = owner.surface('exposure', 200, 50);
  expect(owner.resourceCounters.canvasCount).toBe(3);
  expect(owner.resourceCounters.managedBytes).toBe((300 * 20 + 20 * 300 + 200 * 50) * 4);
  expect(raw.validateSizes).toHaveBeenCalledTimes(3);
  owner.dispose();
  expect([first.canvas.width, overlay.canvas.width, exposure.canvas.width]).toEqual([0, 0, 0]);
  expect(owner.resourceCounters.managedBytes).toBe(0);
});

it('admits the canonical byte graph before draw and retains capacity across cross-aspect resize', () => {
  const owner = session();
  let previous: { release(): void } | undefined;
  raw.draw.mockImplementation((_context, value) => {
    previous?.release();
    const bytes = calculateSpatialRenderAllocations({
      plane: value.source,
      output: value.output,
      halfFloat: true,
    })
      .filter((entry) => entry.canvases === 0)
      .reduce((total, entry) => total + entry.bytes, 0);
    previous = manager().bytes('adapter-contract-probe', bytes);
    expect(owner.resourceCounters.managedBytes).toBe(bytes);
  });
  for (const [width, height] of [
    [1000, 200],
    [200, 1000],
    [2, 2],
    [640, 360],
  ]) {
    const value = request(width!, height!);
    owner.draw(context, value);
    expect(raw.draw).toHaveBeenLastCalledWith(context, value);
  }
  owner.dispose();
  previous?.release();
  expect(owner.resourceCounters.managedBytes).toBe(0);
});

it('keeps the owner usable after dimension validation rejects a surface', () => {
  const owner = session();
  raw.validateSizes.mockImplementationOnce(() => {
    throw new Error('Perspective output size is unavailable.');
  });
  expect(() => owner.surface('plane', 0, 10)).toThrow('output size');
  expect(raw.surface).not.toHaveBeenCalled();
  expect(raw.dispose).not.toHaveBeenCalled();
  owner.surface('plane', 10, 10);
  expect(raw.surface).toHaveBeenCalledWith('plane', 10, 10);
});

it.each(['surface', 'draw'] as const)(
  'closes admitted %s failures and supports a new owner',
  (stage) => {
    const owner = session();
    manager().bytes('retained-test', 132);
    if (stage === 'surface')
      raw.surface.mockImplementationOnce(() => {
        throw new Error('GPU allocation refused');
      });
    else
      raw.draw.mockImplementationOnce(() => {
        throw new Error('GPU allocation refused');
      });
    expect(() =>
      stage === 'surface' ? owner.surface('plane', 20, 20) : owner.draw(context, request(20, 20))
    ).toThrow('GPU allocation refused');
    expect(owner.resourceCounters.managedBytes).toBe(0);
    expect(raw.dispose).toHaveBeenCalledOnce();
    owner.dispose();
    expect(raw.dispose).toHaveBeenCalledOnce();
    raw = rawRenderer();
    create.mockReturnValue(raw);
    const retry = session();
    retry.draw(context, request(20, 20));
    expect(raw.draw).toHaveBeenCalledOnce();
  }
);

it('closes constructor reservations when GPU initialization fails', () => {
  create.mockImplementationOnce((_onLost, resources) => {
    resources.bytes('partial-constructor-test', 132);
    throw new Error('GPU initialization refused');
  });
  expect(() => session()).toThrow('GPU initialization refused');
  expect(() => manager().bytes('late', 1)).toThrow('resource allocation failed');
  const retry = session();
  expect(retry.resourceCounters.managedBytes).toBe(0);
});

it('closes context loss before notification and suppresses stale callbacks', () => {
  const callback = vi.fn();
  const owner = session(callback);
  manager().bytes('retained-test', 132);
  callback.mockImplementation(() => {
    expect(owner.resourceCounters.managedBytes).toBe(0);
    expect(raw.dispose).toHaveBeenCalledOnce();
  });
  const lost = create.mock.lastCall![0]!;
  lost();
  lost();
  owner.dispose();
  expect(callback).toHaveBeenCalledOnce();
  expect(raw.dispose).toHaveBeenCalledOnce();
});
