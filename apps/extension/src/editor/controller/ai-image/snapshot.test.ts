// @vitest-environment jsdom
import { reframeEditorRaster } from '../layer-effects/rasterize/capture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveSelection, Canvas, Group, Rect, Shadow, type FabricObject } from 'fabric';
import {
  captureImageEditorSnapshot,
  isImageSnapshotCurrent,
  prepareImageEditorSnapshot,
} from './snapshot';
import type { ImageApplyController } from './types';

const capture = vi.hoisted(() => vi.fn());
vi.mock('../layer-effects/rasterize/capture', () => ({
  captureEditorRaster: capture,
  reframeEditorRaster: vi.fn(async (image) => image),
}));
vi.mock('fabric', async (original) => {
  const actual = await original<typeof import('fabric')>();
  class FakeCanvas {
    objects: FabricObject[] = [];
    add(...objects: FabricObject[]) {
      this.objects.push(...objects);
    }
    getObjects() {
      return this.objects;
    }
    getActiveObjects() {
      return this.objects.filter((object) => object.sniptaleRole === 'annotation');
    }
  }
  return { ...actual, Canvas: FakeCanvas };
});
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
function setup() {
  const canvas = new Canvas();
  const source = new Rect({ width: 2, height: 3, strokeWidth: 0 });
  source.sniptaleType = 'source-image';
  source.sniptaleRole = 'source';
  source.sniptaleId = 'source';
  const a = new Rect({
    originX: 'left',
    originY: 'top',
    left: 10,
    top: 20,
    width: 20,
    height: 10,
    strokeWidth: 0,
  });
  a.sniptaleId = 'a';
  a.sniptaleRole = 'annotation';
  a.sniptaleType = 'shape';
  const b = new Rect({
    originX: 'left',
    originY: 'top',
    left: 50,
    top: 40,
    width: 10,
    height: 20,
    strokeWidth: 0,
  });
  b.sniptaleId = 'b';
  b.sniptaleRole = 'annotation';
  b.sniptaleType = 'shape';
  canvas.add(source, a, b);
  const controller: ImageApplyController = {
    canvas,
    source: {
      id: 'source',
      dataUrl: png,
      name: 'Source',
      intrinsicWidth: 2,
      intrinsicHeight: 3,
      left: 0,
      top: 0,
      displayWidth: 200,
      displayHeight: 300,
      visible: true,
      locked: false,
    },
    originalDocument: null,
    canvasDocumentSize: { width: 200, height: 300 },
    prepareObject: vi.fn(),
    setSource: vi.fn(),
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: (run) => run(),
    ensureBrowserFrameOnTop: vi.fn(),
  };
  return { canvas, source, a, b, controller };
}
beforeEach(() => {
  capture.mockReset();
  capture.mockImplementation(async (_canvas, bounds) => ({
    dataUrl: png,
    width: bounds.width,
    height: bounds.height,
  }));
});
afterEach(() => vi.restoreAllMocks());

describe('frozen image editor source', () => {
  it('includes offset, blurred shadows in the captured native layer rectangle', async () => {
    const { controller, a } = setup();
    a.set({ shadow: new Shadow({ offsetX: -24, offsetY: 30, blur: 12 }) });
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    expect(snapshot.targetBounds.left).toBeLessThan(-14);
    expect(snapshot.targetBounds.top + snapshot.targetBounds.height).toBeGreaterThan(60);
    expect(snapshot.replacementAllowed).toBe(true);
  });
  it('includes child and ancestor shadows under rotated, scaled groups', async () => {
    const { controller, canvas, a, b } = setup();
    a.set({ shadow: new Shadow({ offsetX: 40, offsetY: 10, blur: 8 }) });
    const group = new Group([a, b], { angle: 25, scaleX: 2, scaleY: 1.5 });
    group.set({ shadow: new Shadow({ offsetX: -80, offsetY: 0, blur: 10 }) });
    group.sniptaleId = 'group';
    group.sniptaleRole = 'annotation';
    group.sniptaleType = 'group';
    canvas.getObjects().splice(1, 2, group);
    vi.spyOn(canvas, 'getActiveObjects').mockReturnValue([group]);
    const whole = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    expect(whole.targetBounds.left).toBeLessThan(group.getBoundingRect().left - 100);
    expect(whole.targetBounds.left + whole.targetBounds.width).toBeGreaterThan(
      a.getBoundingRect().left + a.getBoundingRect().width + 60
    );
    vi.spyOn(canvas, 'getActiveObjects').mockReturnValue([a]);
    const child = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    expect(child.targetBounds.left).toBeLessThan(a.getBoundingRect().left - 100);
    expect(child.replacementAllowed).toBe(false);
  });
  it('captures multiple selected layers together in document coordinates and original order', async () => {
    const { controller, canvas, a, b } = setup();
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    expect(snapshot.targetBounds).toEqual({ left: 10, top: 20, width: 50, height: 40 });
    expect(capture).toHaveBeenCalledWith(canvas, snapshot.targetBounds, ['a', 'b'], undefined);
    expect(snapshot.sources.map((binding) => binding.object)).toEqual([a, b]);
    expect(snapshot.replacementAllowed).toBe(true);
    expect(controller.commitHistory).not.toHaveBeenCalled();
  });
  it('retains source bytes and intrinsic size without annotations or display scaling', async () => {
    const { controller } = setup();
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'source' });
    expect(snapshot.raster).toEqual({ dataUrl: png, width: 2, height: 3 });
    expect(capture).not.toHaveBeenCalled();
  });
  it('requires an explicit unlock and fresh capture before replacing a locked main image', async () => {
    const { controller, source } = setup();
    source.sniptaleLocked = true;
    const locked = await captureImageEditorSnapshot(controller, { intention: 'source' });
    expect(source.sniptaleLocked).toBe(true);
    expect(locked.replacementAllowed).toBe(false);
    source.sniptaleLocked = false;
    expect(locked.replacementAllowed).toBe(false);
    expect(
      (await captureImageEditorSnapshot(controller, { intention: 'source' })).replacementAllowed
    ).toBe(true);
  });
  it('refuses replacement when a source changes or the same ID is recreated', async () => {
    const { controller, canvas, a } = setup();
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    expect(isImageSnapshotCurrent(controller, snapshot)).toBe(true);
    a.set({ left: 11 });
    expect(isImageSnapshotCurrent(controller, snapshot)).toBe(false);
    a.set({ left: 10 });
    expect(isImageSnapshotCurrent(controller, snapshot)).toBe(true);
    const replacement = new Rect({
      originX: 'left',
      originY: 'top',
      left: 10,
      top: 20,
      width: 20,
      height: 10,
      strokeWidth: 0,
    });
    replacement.sniptaleId = 'a';
    canvas.getObjects()[1] = replacement;
    expect(isImageSnapshotCurrent(controller, snapshot)).toBe(false);
  });
  it('deduplicates a selected group and descendant and rejects hidden selection explicitly', async () => {
    const { controller, canvas, a, b } = setup();
    const group = new Group([a, b]);
    group.sniptaleRole = 'annotation';
    group.sniptaleId = 'group';
    group.sniptaleType = 'group';
    vi.spyOn(canvas, 'getActiveObjects').mockReturnValue([group, a]);
    canvas.add(group);
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]?.object).toBe(group);
    group.set({ visible: false });
    await expect(captureImageEditorSnapshot(controller, { intention: 'layers' })).rejects.toThrow(
      'unsupported-selection'
    );
  });
  it('does not replace separated or locked layers and captures only the requested region context', async () => {
    const { controller, canvas, a, b } = setup();
    const foreign = new Rect();
    canvas.getObjects().splice(2, 0, foreign);
    vi.spyOn(canvas, 'getActiveObjects').mockReturnValue([a, b]);
    expect(
      (await captureImageEditorSnapshot(controller, { intention: 'layers' })).replacementAllowed
    ).toBe(false);
    const snapshot = await captureImageEditorSnapshot(controller, {
      intention: 'region',
      region: { left: 5, top: 10, width: 20, height: 30 },
      context: 'region',
    });
    expect(snapshot.inputBounds).toEqual(snapshot.targetBounds);
    expect(capture.mock.calls.at(-1)?.[2]).toBeUndefined();
  });
});

it('keeps the frozen source current when only temporary ActiveSelection grouping changes', async () => {
  const { controller, a, b } = setup();
  const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
  const selection = new ActiveSelection([a, b]);
  expect(isImageSnapshotCurrent(controller, snapshot)).toBe(true);
  selection.removeAll();
  expect(isImageSnapshotCurrent(controller, snapshot)).toBe(true);
});

it('prepares retained source content without recapturing a changed live selection', async () => {
  const { controller, a } = setup();
  const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
  a.set({ left: 99 });
  const prepared = await prepareImageEditorSnapshot(snapshot, { width: 768, height: 768 });
  expect(capture).toHaveBeenCalledOnce();
  expect(prepared.targetBounds).toEqual(snapshot.targetBounds);
  expect(prepared.inputBounds).toEqual({ left: -349, top: -344, width: 768, height: 768 });
  expect(reframeEditorRaster).toHaveBeenCalledWith(
    snapshot.captureRaster,
    snapshot.captureBounds,
    snapshot.captureBounds,
    prepared.inputBounds,
    undefined
  );
});
