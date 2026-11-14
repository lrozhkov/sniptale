// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Canvas, Group, Rect, type FabricObject } from 'fabric';
import { captureEditorRaster, reframeEditorRaster } from './capture';

const calls = vi.hoisted(() => ({
  project: vi.fn(),
  proxies: vi.fn(),
  render: vi.fn(),
  drawImage: vi.fn(),
}));
vi.mock('../../../../composition/frame-annotation-raster-client', () => ({
  rasterizeFrameAnnotations: calls.project,
}));
vi.mock('../../../frame-annotation/proxy', () => ({
  collectFrameAnnotationProxies: calls.proxies,
}));
vi.mock('../../../../platform/runtime-messaging', () => ({
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: vi.fn() }),
}));
vi.mock('fabric', async (original) => {
  const actual = await original<typeof import('fabric')>();
  class FakeCanvas {
    width = 200;
    height = 300;
    viewportTransform = [2, 0, 0, 2, 50, 60];
    enableRetinaScaling = true;
    backgroundColor = 'white';
    overlayColor = '';
    backgroundImage = undefined;
    overlayImage = undefined;
    objects: FabricObject[] = [];
    add(...objects: FabricObject[]) {
      this.objects.push(...objects);
    }
    getObjects() {
      return this.objects;
    }
    set(properties: object) {
      Object.assign(this, properties);
    }
    calcViewportBoundaries() {}
    drawControls() {
      throw new Error('Capture must not draw interactive controls');
    }
    renderCanvas(_context: CanvasRenderingContext2D, objects: FabricObject[]) {
      calls.render(this, objects);
      this.drawControls();
    }
  }
  return { ...actual, Canvas: FakeCanvas };
});
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
const bounds = { left: 10, top: 20, width: 2, height: 3 };
beforeEach(() => {
  vi.clearAllMocks();
  calls.proxies.mockReturnValue([]);
  calls.render.mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: calls.drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(png);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2, height: 3, close: vi.fn() }))
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('captures native pixels on an output canvas and restores zoom, DPR and controls', async () => {
  const canvas = new Canvas();
  const a = new Rect();
  a.sniptaleId = 'a';
  canvas.add(a);
  const transform = canvas.viewportTransform,
    controls = canvas.drawControls;
  calls.render.mockImplementation((current: Canvas, objects: FabricObject[]) => {
    expect(current.viewportTransform).toEqual([1, 0, 0, 1, -10, -20]);
    expect(current.enableRetinaScaling).toBe(false);
    expect(objects).toEqual([a]);
  });
  expect(await captureEditorRaster(canvas, bounds)).toMatchObject({ width: 2, height: 3 });
  expect(canvas.viewportTransform).toBe(transform);
  expect(canvas.drawControls).toBe(controls);
  expect(canvas.enableRetinaScaling).toBe(true);
  expect(canvas.width).toBe(200);
  expect(canvas.height).toBe(300);
});
it('captures a child through its group without reparenting and restores sibling visibility on failure', async () => {
  const canvas = new Canvas();
  const a = new Rect();
  a.sniptaleId = 'a';
  const b = new Rect();
  b.sniptaleId = 'b';
  const group = new Group([a, b], { opacity: 0.5 });
  group.sniptaleId = 'group';
  canvas.add(group);
  calls.render.mockImplementation(() => {
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false);
    expect(a.parent).toBe(group);
    expect(canvas.backgroundColor).toBe('');
    expect(group.opacity).toBe(0.5);
    throw new Error('render-failed');
  });
  await expect(captureEditorRaster(canvas, bounds, ['a'])).rejects.toThrow('render-failed');
  expect(a.visible).toBe(true);
  expect(b.visible).toBe(true);
  expect(a.parent).toBe(group);
  expect(canvas.backgroundColor).toBe('white');
  expect(canvas.width).toBe(200);
  expect(calls.project).not.toHaveBeenCalled();
});
it('uses canonical annotation projection and rejects failure instead of returning blank pixels', async () => {
  const canvas = new Canvas();
  const proxy = new Rect();
  proxy.sniptaleId = 'frame';
  proxy.sniptaleType = 'frame-annotation';
  canvas.add(proxy);
  calls.proxies.mockImplementation((objects: FabricObject[]) =>
    objects
      .filter((object) => object.visible && object === proxy)
      .map((object) => ({ object, snapshot: { id: 'frozen-frame-snapshot' } }))
  );
  calls.project.mockRejectedValue(new Error('projection-failed'));
  calls.render.mockImplementation((_current: Canvas, objects: FabricObject[]) =>
    expect(objects).toEqual([])
  );
  const controls = canvas.drawControls;
  await expect(captureEditorRaster(canvas, bounds, ['frame'])).rejects.toThrow('projection-failed');
  expect(calls.project).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        width: 200,
        height: 300,
        snapshots: [{ id: 'frozen-frame-snapshot' }],
      }),
    })
  );
  expect(canvas.drawControls).toBe(controls);
  expect(proxy.visible).toBe(true);
});

it('refuses out-of-document pixels before rendering when annotation projection is required', async () => {
  const canvas = new Canvas();
  calls.proxies.mockReturnValue([{ object: new Rect(), snapshot: { id: 'frame' } }]);
  await expect(
    captureEditorRaster(canvas, { left: -5, top: 0, width: 20, height: 20 })
  ).rejects.toThrow('unsupported-selection');
  expect(calls.render).not.toHaveBeenCalled();
  expect(calls.project).not.toHaveBeenCalled();
});
it('refuses oversized capture before rendering or projection', async () => {
  const canvas = new Canvas();
  await expect(
    captureEditorRaster(canvas, { left: 0, top: 0, width: 8192, height: 8192 })
  ).rejects.toThrow('too-large');
  expect(calls.render).not.toHaveBeenCalled();
  expect(calls.project).not.toHaveBeenCalled();
});
it('copies a frozen native crop into padding without resampling', async () => {
  const from = { left: 10, top: 20, width: 2, height: 3 };
  const content = { left: 11, top: 21, width: 1, height: 2 };
  const output = { left: 11, top: 20, width: 2, height: 3 };
  const image = { dataUrl: png, width: 2, height: 3 };
  const result = await reframeEditorRaster(image, from, content, output);
  expect(result).toEqual(image);
  expect(calls.drawImage).toHaveBeenCalledWith(expect.anything(), 1, 1, 1, 2, 0, 1, 1, 2);
  const context = document.createElement('canvas').getContext('2d');
  expect(context?.imageSmoothingEnabled).toBe(false);
  expect((await vi.mocked(createImageBitmap).mock.results[0]!.value).close).toHaveBeenCalledOnce();
});
it('rejects truncated content before decode and closes a bitmap when cancelled during decode', async () => {
  const image = { dataUrl: png, width: 2, height: 3 };
  const output = { ...bounds, left: 11 };
  await expect(reframeEditorRaster(image, bounds, bounds, output)).rejects.toThrow(
    'output-too-small'
  );
  expect(createImageBitmap).not.toHaveBeenCalled();
  const controller = new AbortController();
  const bitmap = { width: 2, height: 3, close: vi.fn() };
  vi.mocked(createImageBitmap).mockImplementationOnce(async () => {
    controller.abort();
    return bitmap as unknown as ImageBitmap;
  });
  await expect(
    reframeEditorRaster(image, bounds, { ...bounds, left: 11, width: 1 }, output, controller.signal)
  ).rejects.toThrow();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(calls.drawImage).not.toHaveBeenCalled();
});
