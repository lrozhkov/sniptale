// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGlTransitionSelection } from '../../../features/video/project/transition/gl-catalog';
import type { GlTrackNode } from '../../../features/video/project/transition/gl-track-plan';
import { createGlTransitionCanvas } from '../../../features/video/composition/canvas/gl-transition';
import { createNativeGlTrackCanvas, type NativeGlTrackCanvasTarget } from './gl-track-canvas';

function gate() {
  let complete: () => void = () => {
    throw new Error('Gate is not initialized.');
  };
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, complete: () => complete() };
}
function state(id: string): GlTrackNode {
  return { kind: 'state', clipIds: [id] };
}
function join(before: GlTrackNode, after: GlTrackNode): GlTrackNode {
  return {
    kind: 'gl',
    before,
    after,
    junction: {
      id: 'join',
      leadingClipId: 'A',
      trailingClipId: 'B',
      start: 0,
      progress: 0.5,
      selection: createGlTransitionSelection('Fade')!,
    },
  };
}
function fixture() {
  const canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    const context = { canvas: this, reset: vi.fn() } as unknown as CanvasRenderingContext2D;
    canvases.push(this);
    return context;
  });
  const render = vi.fn<ReturnType<typeof createGlTransitionCanvas>['render']>(async (request) => {
    expect(request.from).not.toBe(request.to);
    expect(request.context.canvas).not.toBe(request.from);
    expect(request.context.canvas).not.toBe(request.to);
    const from = request.from instanceof HTMLCanvasElement ? request.from.dataset['content'] : '';
    const to = request.to instanceof HTMLCanvasElement ? request.to.dataset['content'] : '';
    request.context.canvas.dataset['content'] = `(${from}+${to})`;
  });
  const dispose = vi.fn();
  const createBackend = vi.fn(() => ({ render, dispose }));
  const owner = createNativeGlTrackCanvas(document, createBackend);
  const request = {
    root: join(state('A'), state('B')),
    width: 8,
    height: 4,
    ratio: 2,
    signal: new AbortController().signal,
    paintState: vi.fn(async (target: NativeGlTrackCanvasTarget, clipIds: readonly string[]) => {
      target.canvas.dataset['content'] = clipIds.join(',');
    }),
  } satisfies Parameters<typeof owner.render>[0];
  return { owner, request, render, dispose, canvases };
}
afterEach(() => vi.restoreAllMocks());

it('executes the same nested state order with distinct held inputs and an exclusive completed output', async () => {
  const f = fixture();
  const lease = await f.owner.render({
    ...f.request,
    root: join(join(state('A'), state('B')), state('C')),
  });
  expect(lease.canvas.dataset['content']).toBe('((A+B)+C)');
  expect(f.render).toHaveBeenCalledTimes(2);
  await expect(f.owner.render(f.request)).rejects.toThrow('already in flight');
  lease.release();
  lease.release();
  const repeated = await f.owner.render(f.request);
  expect(repeated.canvas.dataset['content']).toBe('(A+B)');
  expect(f.canvases).toHaveLength(3);
  repeated.release();
  f.owner.dispose();
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(f.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

it('releases a refused paint and permits a clean retry without modifying its source plan', async () => {
  const f = fixture();
  const original = structuredClone(f.request.root);
  f.request.paintState.mockRejectedValueOnce(new Error('paint refused'));
  await expect(f.owner.render(f.request)).rejects.toThrow('paint refused');
  expect(f.request.root).toEqual(original);
  const lease = await f.owner.render(f.request);
  expect(lease.canvas.dataset['content']).toBe('(A+B)');
  lease.release();
  f.owner.dispose();
});

it('retains both inputs during cancellation until the submitted copy settles', async () => {
  const f = fixture(),
    entered = gate(),
    completion = gate(),
    abort = new AbortController();
  f.render.mockImplementationOnce(async (request) => {
    entered.complete();
    await completion.promise;
    expect(request.from.width).toBe(8);
    expect(request.to.width).toBe(8);
    request.signal.throwIfAborted();
  });
  const pending = f.owner.render({ ...f.request, signal: abort.signal });
  const refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  abort.abort();
  expect(f.canvases.every((canvas) => canvas.width === 8)).toBe(true);
  completion.complete();
  await refused;
  f.owner.dispose();
  expect(f.canvases.every((canvas) => canvas.width === 0)).toBe(true);
});

it('defers surface destruction when its owner is disposed during asynchronous source paint', async () => {
  const f = fixture(),
    entered = gate(),
    completion = gate();
  f.request.paintState.mockImplementationOnce(async () => {
    entered.complete();
    await completion.promise;
  });
  const pending = f.owner.render(f.request);
  const refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  f.owner.dispose();
  expect(f.canvases[0]?.width).toBe(8);
  completion.complete();
  await refused;
  expect(f.render).not.toHaveBeenCalled();
  expect(f.canvases.every((canvas) => canvas.width === 0)).toBe(true);
  await expect(f.owner.render(f.request)).rejects.toThrow('disposed');
});

it('keeps the state surface separate from a synchronous backdrop scratch lease', async () => {
  const f = fixture();
  f.request.paintState.mockImplementation(async (target, ids) => {
    target.withScratch((scratch) => {
      expect(scratch.canvas).not.toBe(target.canvas);
      expect(target.canvas.width).toBe(8);
      scratch.canvas.dataset['content'] = 'backdrop';
    });
    target.canvas.dataset['content'] = ids.join(',');
  });
  const lease = await f.owner.render(f.request);
  expect(lease.canvas.dataset['content']).toBe('(A+B)');
  lease.release();
  f.owner.dispose();
});

it('refuses invalid dimensions before preparing sources or allocating a surface', async () => {
  const f = fixture();
  await expect(f.owner.render({ ...f.request, width: Infinity })).rejects.toThrow();
  expect(f.request.paintState).not.toHaveBeenCalled();
  expect(f.canvases).toHaveLength(0);
  f.owner.dispose();
});
