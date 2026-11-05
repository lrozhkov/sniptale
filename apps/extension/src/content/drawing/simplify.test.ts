// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Image as CanvasImage } from 'canvas';
import { createSimplifyRaster } from '../../features/simplify/raster';
import {
  createDrawingSession,
  type DrawingSimplifyObject,
  type DrawingSimplifySource,
} from '../../features/drawing/public';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import { createContentSimplifyRuntime } from './simplify';
import type { SimplifyComputeRequest } from '../../workflows/simplify/compute-client';

afterEach(() => {
  document.body.replaceChildren();
  document.body.classList.remove('sniptale-capture-ui-hidden');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function png(width = 100, height = 100) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const commit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit: commit });
  const source: DrawingSimplifySource = {
    ...png(),
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  const renders: Array<{
    request: Extract<SimplifyComputeRequest, { operation: 'render' }>;
    completion: ReturnType<typeof deferred<unknown>>;
  }> = [];
  const acquire = vi.fn(async () => source);
  const decode = vi.fn(async (): Promise<void> => undefined);
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare')
      return { success: true, sessionId: 'test', width: 100, height: 100, version: '1' };
    if (request.operation === 'render') {
      const completion = deferred<unknown>();
      renders.push({ request, completion });
      return completion.promise;
    }
    return { success: true, result: 'disposed' };
  });
  const runtime = createContentSimplifyRuntime(session, { send, acquire, decode });
  const object: DrawingSimplifyObject = {
    id: 'simplify-1',
    kind: 'simplify',
    bounds: { x: 10, y: 15, width: 50, height: 40 },
    settings: createDefaultSimplifySettings(),
  };
  const settle = async (index = renders.length - 1) => {
    const render = renders[index]!;
    render.completion.resolve({
      success: true,
      sessionId: 'test',
      ...png(render.request.region.width, render.request.region.height),
      version: '1',
    });
    await Promise.resolve();
    await Promise.resolve();
  };
  return { session, source, object, runtime, send, acquire, decode, renders, settle, commit };
}
async function started(h: ReturnType<typeof harness>, count = 1) {
  await vi.waitFor(() => expect(h.renders).toHaveLength(count));
}
it('keeps new work outside history and admits only after result decoding succeeds', async () => {
  const h = harness();
  const decoded = deferred<void>();
  h.decode.mockReturnValue(decoded.promise);
  const work = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  expect(h.session.getSnapshot().document.objects).toHaveLength(0);
  expect(h.runtime.getPending()).toHaveLength(1);
  await h.settle();
  expect(h.decode).toHaveBeenCalledOnce();
  expect(h.session.getSnapshot().document.objects).toHaveLength(0);
  decoded.resolve();
  await work;
  expect(h.session.getSnapshot().document.objects[0]).toMatchObject({
    id: h.object.id,
    source: h.source,
    result: { width: 50, height: 40 },
  });
  expect(h.runtime.getPending()).toHaveLength(0);
  h.runtime.dispose();
});
it('reuses the retained source and worker session for settings changes', async () => {
  const h = harness();
  const work = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  await h.settle();
  await work;
  const accepted = h.session.getSnapshot().document.objects[0];
  if (accepted?.kind !== 'simplify') throw new Error('Missing layer');
  const changed = h.runtime.update(accepted, { sensitivity: 90 });
  await started(h, 2);
  expect(h.session.getSnapshot().document.objects[0]).toBe(accepted);
  await h.settle();
  await changed;
  expect(h.acquire).toHaveBeenCalledOnce();
  expect(h.send.mock.calls.filter(([request]) => request.operation === 'prepare')).toHaveLength(1);
  expect(h.session.getSnapshot().document.objects[0]).toMatchObject({
    settings: { sensitivity: 90 },
  });
  h.runtime.dispose();
});
it('preserves the accepted result and settings after worker failure', async () => {
  const h = harness();
  const work = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  await h.settle();
  await work;
  const accepted = h.session.getSnapshot().document.objects[0];
  if (accepted?.kind !== 'simplify') throw new Error('Missing layer');
  const changed = h.runtime.update(accepted, { content: 'all' });
  await started(h, 2);
  h.renders[1]!.completion.reject(new Error('Worker failed'));
  await changed;
  expect(h.session.getSnapshot().document.objects[0]).toBe(accepted);
  expect(h.runtime.getFeedback()).toBe('failed');
  h.runtime.dispose();
});
it('cannot resurrect a deleted layer after the same identity is restored', async () => {
  const h = harness();
  const work = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  await h.settle();
  await work;
  const accepted = h.session.getSnapshot().document.objects[0];
  if (accepted?.kind !== 'simplify') throw new Error('Missing layer');
  const update = h.runtime.update(accepted, { thickness: 0.65 });
  await started(h, 2);
  h.session.deleteObjects([accepted.id]);
  h.session.commitObject(accepted);
  await h.settle();
  await update;
  expect(h.session.getSnapshot().document.objects).toEqual([accepted]);
  h.runtime.dispose();
});
it('ignores a stale first response when a newer draft replaces it', async () => {
  const h = harness();
  const first = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  const newer = { ...h.object, id: 'simplify-2', source: h.source };
  const second = h.runtime.submit(newer);
  await started(h, 2);
  await h.settle(0);
  await first;
  expect(h.session.getSnapshot().document.objects).toHaveLength(0);
  await h.settle(1);
  await second;
  expect(h.session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
    'simplify-2',
  ]);
  h.runtime.dispose();
});
it.each(['cancel', 'dispose'] as const)(
  'does not admit delayed work after %s',
  async (operation) => {
    const h = harness();
    const work = h.runtime.submit(h.object, new Event('pointerup'));
    await started(h);
    h.runtime[operation]();
    await h.settle();
    await work;
    expect(h.session.getSnapshot().document.objects).toHaveLength(0);
    h.runtime.dispose();
  }
);
it('checks both dimensions and refuses a source that cannot cover the requested region', async () => {
  const h = harness();
  await h.runtime.submit(
    { ...h.object, bounds: { ...h.object.bounds, width: 2 } },
    new Event('pointerup')
  );
  expect(h.runtime.getFeedback()).toBe('too-small');
  expect(h.acquire).not.toHaveBeenCalled();
  await h.runtime.submit(
    { ...h.object, bounds: { ...h.object.bounds, height: 2 } },
    new Event('pointerup')
  );
  expect(h.runtime.getFeedback()).toBe('too-small');
  await h.runtime.submit(
    { ...h.object, source: h.source, bounds: { x: 110, y: 0, width: 20, height: 20 } },
    new Event('pointerup')
  );
  expect(h.runtime.getFeedback()).toBe('no-source');
  expect(h.acquire).toHaveBeenCalledOnce();
  expect(h.send).not.toHaveBeenCalled();
  h.runtime.dispose();
});

it('recomputes the moved Auto region from the retained source', async () => {
  const h = harness();
  const original = { ...h.object, source: h.source, result: png(50, 40) };
  h.session.commitObject(original);
  h.commit.mockClear();
  const moved = { ...original, bounds: { ...original.bounds, x: 25, y: 30 } };
  const work = h.runtime.transform([moved]);
  await started(h);
  expect(h.renders[0]!.request.region).toEqual({ x: 25, y: 30, width: 50, height: 40 });
  expect(h.session.getSnapshot().document.objects[0]).toBe(original);
  await h.settle();
  await work;
  expect(h.session.getSnapshot().document.objects[0]).toMatchObject({ bounds: moved.bounds });
  expect(h.acquire).not.toHaveBeenCalled();
  expect(h.commit).toHaveBeenCalledOnce();
  h.runtime.dispose();
});
it('renders rotated Auto source as a world-aligned bounding box', async () => {
  const h = harness();
  const original = { ...h.object, source: h.source, result: png(50, 40) };
  h.session.commitObject(original);
  const work = h.runtime.transform([{ ...original, rotation: 90 }]);
  await started(h);
  expect(h.renders[0]!.request.region).toEqual({ x: 15, y: 10, width: 40, height: 50 });
  await h.settle();
  await work;
  h.runtime.dispose();
});
it('admits a mixed selection in one history step after sequential mask results succeed', async () => {
  const h = harness();
  const first = { ...h.object, source: h.source, result: png(50, 40) };
  const second = { ...first, id: 'second', bounds: { x: 20, y: 25, width: 30, height: 20 } };
  const box = {
    id: 'box',
    kind: 'rectangle',
    bounds: { x: 5, y: 5, width: 10, height: 10 },
    color: '#123456',
    width: 1,
  } as const;
  h.session.commitObject(first);
  h.session.commitObject(second);
  h.session.commitObject(box);
  h.commit.mockClear();
  const targets = [
    { ...first, bounds: { ...first.bounds, x: 15 } },
    { ...second, bounds: { ...second.bounds, x: 30 } },
    { ...box, bounds: { ...box.bounds, x: 25 } },
  ];
  const work = h.runtime.transform(targets);
  await started(h);
  expect(h.renders).toHaveLength(1);
  await h.settle(0);
  await started(h, 2);
  expect(h.session.getSnapshot().document.objects).toEqual([first, second, box]);
  expect(h.commit).not.toHaveBeenCalled();
  await h.settle(1);
  await work;
  expect(h.commit).toHaveBeenCalledOnce();
  expect(
    h.session
      .getSnapshot()
      .document.objects.map((object) => ('bounds' in object ? object.bounds.x : null))
  ).toEqual([15, 30, 25]);
  expect(h.send.mock.calls.filter(([request]) => request.operation === 'prepare')).toHaveLength(1);
  h.runtime.dispose();
});
it('keeps an entire mixed selection unchanged if a later mask result fails', async () => {
  const h = harness();
  const first = { ...h.object, source: h.source, result: png(50, 40) };
  const second = { ...first, id: 'second' };
  h.session.commitObject(first);
  h.session.commitObject(second);
  h.commit.mockClear();
  const work = h.runtime.transform([
    { ...first, bounds: { ...first.bounds, x: 20 } },
    { ...second, bounds: { ...second.bounds, x: 25 } },
  ]);
  await started(h);
  await h.settle(0);
  await started(h, 2);
  h.renders[1]!.completion.reject(new Error('Second mask failed'));
  await work;
  expect(h.session.getSnapshot().document.objects).toEqual([first, second]);
  expect(h.commit).not.toHaveBeenCalled();
  h.runtime.dispose();
});
it('moves a manual Image primitive without requesting another analysis', async () => {
  const h = harness();
  const original = {
    ...h.object,
    settings: { ...h.object.settings, automatic: false, manualKind: 'image' as const },
    source: h.source,
    result: png(50, 40),
  };
  h.session.commitObject(original);
  h.commit.mockClear();
  const moved = { ...original, rotation: 35, bounds: { ...original.bounds, x: 200 } };
  await h.runtime.transform([moved]);
  expect(h.session.getSnapshot().document.objects[0]).toBe(moved);
  expect(h.send).not.toHaveBeenCalled();
  expect(h.commit).toHaveBeenCalledOnce();
  h.runtime.dispose();
});

it('does not admit a new pending mask after the active tool changes', async () => {
  const h = harness();
  const work = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  h.session.setActiveTool('select');
  await h.settle();
  await work;
  expect(h.session.getSnapshot().document.objects).toHaveLength(0);
  h.runtime.dispose();
});
it('reports history admission refusal without changing the drawing document', async () => {
  const h = harness();
  h.commit.mockReturnValue(false);
  const work = h.runtime.submit(h.object, new Event('pointerup'));
  await started(h);
  await h.settle();
  await work;
  expect(h.session.getSnapshot().document.objects).toHaveLength(0);
  expect(h.runtime.getFeedback()).toBe('failed');
  h.runtime.dispose();
});

it('prepares a mixed duplicate batch before one atomic append and records the producing engine', async () => {
  const h = harness();
  const mask = { ...h.object, source: h.source, result: png(50, 40), sourceDirty: true };
  const box = {
    id: 'box',
    kind: 'rectangle',
    bounds: { x: 5, y: 5, width: 10, height: 10 },
    color: '#123456',
    width: 1,
  } as const;
  h.session.commitObjects([mask, box]);
  h.commit.mockClear();
  const work = h.runtime.duplicate();
  await started(h);
  expect(h.session.getSnapshot().document.objects).toEqual([mask, box]);
  expect(h.renders[0]!.request.region).toEqual({ x: 22, y: 27, width: 50, height: 40 });
  await h.settle();
  await work;
  const accepted = h.session.getSnapshot().document.objects;
  expect(accepted).toHaveLength(4);
  expect(h.commit).toHaveBeenCalledOnce();
  expect(accepted[2]).toMatchObject({
    kind: 'simplify',
    sourceDirty: false,
    engineVersion: '1',
    bounds: { x: 22, y: 27 },
    source: h.source,
  });
  expect(accepted[2]!.id).not.toBe(mask.id);
  expect(h.session.getSnapshot().selectedObjectIds).toEqual(
    accepted.slice(2).map((object) => object.id)
  );
  h.runtime.dispose();
});
it('cannot append delayed duplicates after their source object was removed', async () => {
  const h = harness();
  const mask = { ...h.object, source: h.source, result: png(50, 40) };
  h.session.commitObject(mask);
  const work = h.runtime.duplicate();
  await started(h);
  h.session.deleteSelected();
  await h.settle();
  await work;
  expect(h.session.getSnapshot().document.objects).toHaveLength(0);
  h.runtime.dispose();
});

it('renders a rotated manual Text tile in local coordinates through the worker projection contract', async () => {
  const h = harness();
  const original = {
    ...h.object,
    settings: { ...h.object.settings, automatic: false, manualKind: 'text' as const },
    source: h.source,
    result: png(50, 40),
  };
  h.session.commitObject(original);
  const work = h.runtime.transform([{ ...original, rotation: 30 }]);
  await started(h);
  expect(h.renders[0]!.request.region).toEqual({
    x: 10,
    y: 15,
    width: 50,
    height: 40,
    rotation: 30,
  });
  await h.settle();
  await work;
  expect(h.session.getSnapshot().document.objects[0]).toMatchObject({
    rotation: 30,
    result: { width: 50, height: 40 },
  });
  h.runtime.dispose();
});

it('keeps the shared manual Image glyph proportions after a nonuniform resize', async () => {
  vi.stubGlobal('Image', CanvasImage);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 300;
  sourceCanvas.height = 150;
  const sourceContext = sourceCanvas.getContext('2d')!;
  sourceContext.fillStyle = '#f4f7fa';
  sourceContext.fillRect(0, 0, 300, 150);
  const source = {
    dataUrl: sourceCanvas.toDataURL(),
    width: 300,
    height: 150,
    bounds: { x: 0, y: 0, width: 300, height: 150 },
  };
  let preparedCanvas = sourceCanvas;
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare') {
      const image = new Image();
      image.src = request.dataUrl;
      preparedCanvas = document.createElement('canvas');
      preparedCanvas.width = image.width;
      preparedCanvas.height = image.height;
      preparedCanvas.getContext('2d')!.drawImage(image, 0, 0);
      return {
        success: true,
        sessionId: 'primitive',
        width: image.width,
        height: image.height,
        version: 'simplify-v1',
      };
    }
    if (request.operation === 'render') {
      const { region, settings } = request;
      const context = preparedCanvas.getContext('2d')!;
      const output = document.createElement('canvas');
      output.width = preparedCanvas.width;
      output.height = preparedCanvas.height;
      createSimplifyRaster(
        context.getImageData(0, 0, preparedCanvas.width, preparedCanvas.height)
      ).render(output.getContext('2d')!, preparedCanvas, region, settings);
      const tile = document.createElement('canvas');
      tile.width = region.width;
      tile.height = region.height;
      tile
        .getContext('2d')!
        .drawImage(
          output,
          region.x,
          region.y,
          region.width,
          region.height,
          0,
          0,
          region.width,
          region.height
        );
      return {
        success: true,
        sessionId: 'primitive',
        width: region.width,
        height: region.height,
        dataUrl: tile.toDataURL(),
        version: 'simplify-v1',
      };
    }
    return { success: true, result: 'disposed' };
  });
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const runtime = createContentSimplifyRuntime(session, {
    send,
    acquire: async () => source,
    decode: async () => undefined,
  });
  const settings = {
    ...createDefaultSimplifySettings(),
    automatic: false,
    manualKind: 'image' as const,
    color: '#405065',
  };
  await runtime.submit(
    { id: 'glyph', kind: 'simplify', bounds: { x: 20, y: 20, width: 60, height: 60 }, settings },
    new Event('pointerup')
  );
  const accepted = session.getSnapshot().document.objects[0];
  if (accepted?.kind !== 'simplify' || !accepted.result) throw new Error('Missing primitive');
  const glyphAspect = (object: DrawingSimplifyObject) => {
    const image = new Image();
    image.src = object.result!.dataUrl;
    const display = document.createElement('canvas');
    display.width = object.bounds.width;
    display.height = object.bounds.height;
    const context = display.getContext('2d')!;
    context.drawImage(image, 0, 0, display.width, display.height);
    const data = context.getImageData(0, 0, display.width, display.height).data;
    const xs: number[] = [],
      ys: number[] = [];
    for (let y = 0; y < display.height; y++)
      for (let x = 0; x < display.width; x++) {
        const p = (y * display.width + x) * 4;
        if (
          Math.abs(data[p]! - 64) + Math.abs(data[p + 1]! - 80) + Math.abs(data[p + 2]! - 101) >
          40
        ) {
          xs.push(x);
          ys.push(y);
        }
      }
    return (Math.max(...xs) - Math.min(...xs) + 1) / (Math.max(...ys) - Math.min(...ys) + 1);
  };
  const before = glyphAspect(accepted);
  await runtime.transform([{ ...accepted, bounds: { ...accepted.bounds, width: 120 } }]);
  const resized = session.getSnapshot().document.objects[0];
  if (resized?.kind !== 'simplify') throw new Error('Missing resized primitive');
  expect(glyphAspect(resized)).toBeCloseTo(before, 1);
  expect(resized.result?.width).toBe(120);
  expect(resized.source).toBe(source);
  await runtime.transform([{ ...resized, bounds: { ...resized.bounds, x: 350, width: 180 } }]);
  const outside = session.getSnapshot().document.objects[0];
  if (outside?.kind !== 'simplify') throw new Error('Missing primitive outside source');
  expect(glyphAspect(outside)).toBeCloseTo(before, 1);
  expect(outside.result?.width).toBe(180);
  expect(outside.source).toBe(source);
  runtime.dispose();
  session.dispose();
});

it('preserves the accepted manual Image tile if its resized replacement fails', async () => {
  const h = harness();
  const original = {
    ...h.object,
    settings: { ...h.object.settings, automatic: false, manualKind: 'image' as const },
    source: h.source,
    result: png(50, 40),
  };
  h.session.commitObject(original);
  const work = h.runtime.transform([{ ...original, bounds: { ...original.bounds, width: 70 } }]);
  await started(h);
  expect(h.session.getSnapshot().document.objects[0]).toBe(original);
  h.renders[0]!.completion.reject(new Error('Primitive render failed'));
  await work;
  expect(h.session.getSnapshot().document.objects[0]).toBe(original);
  expect(h.runtime.getFeedback()).toBe('failed');
  h.runtime.dispose();
});
