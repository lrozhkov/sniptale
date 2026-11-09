import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { prepareEditorBackgroundLayer, syncEditorBackgroundLayer } from './sync';

function createFrame(patch: Partial<EditorFrameSettings>): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#112233',
    ...patch,
  };
}

function createCanvas(objects: Rect[] = []) {
  return {
    add: vi.fn((object: Rect) => objects.push(object)),
    getObjects: () => objects,
    moveObjectTo: vi.fn((object: Rect, index: number) => {
      const currentIndex = objects.indexOf(object);
      if (currentIndex >= 0) {
        objects.splice(currentIndex, 1);
        objects.splice(index, 0, object);
      }
    }),
    remove: vi.fn((object: Rect) => {
      const index = objects.indexOf(object);
      if (index >= 0) {
        objects.splice(index, 1);
      }
    }),
    sendObjectToBack: vi.fn((object: Rect) => {
      const index = objects.indexOf(object);
      objects.splice(index, 1);
      objects.unshift(object);
    }),
  };
}

it('ignores stale async background sync results before mutating the canvas', async () => {
  const previous = new Rect({ width: 100, height: 60 });
  previous.sniptaleRole = 'background';
  previous.sniptaleType = 'background';
  const canvas = createCanvas([previous]);
  const prepareObject = vi.fn();

  await syncEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    createMutationToken: vi.fn(() => 1),
    frame: createFrame({ backgroundMode: 'color' }),
    isMutationTokenCurrent: vi.fn(() => false),
    prepareObject,
  });

  expect(canvas.getObjects()).toEqual([previous]);
  expect(canvas.remove).not.toHaveBeenCalled();
  expect(canvas.add).not.toHaveBeenCalled();
  expect(prepareObject).not.toHaveBeenCalled();
});

it('removes the managed background when the resolved frame is transparent', async () => {
  const previous = new Rect({ width: 100, height: 60 });
  previous.sniptaleRole = 'background';
  previous.sniptaleType = 'background';
  const canvas = createCanvas([previous]);

  await syncEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({ backgroundColor: 'transparent', backgroundMode: 'color' }),
    prepareObject: vi.fn(),
  });

  expect(canvas.getObjects()).toEqual([]);
  expect(canvas.remove).toHaveBeenCalledWith(previous);
});

it('reuses unchanged background paint and dimensions after source style changes', async () => {
  const canvas = createCanvas();
  const frame = createFrame({ backgroundMode: 'color' });
  const options = {
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame,
    prepareObject: vi.fn(),
  };
  await syncEditorBackgroundLayer(options);
  const first = canvas.getObjects()[0];
  await syncEditorBackgroundLayer({
    ...options,
    frame: { ...frame, sourceImage: { ...frame.sourceImage!, radius: 18 } },
  });
  expect(canvas.getObjects()[0]).toBe(first);
  expect(options.prepareObject).toHaveBeenCalledOnce();
  await syncEditorBackgroundLayer({ ...options, canvasSize: { width: 640, height: 360 } });
  expect(canvas.getObjects()[0]).not.toBe(first);
  expect(options.prepareObject).toHaveBeenCalledTimes(2);
});

it('prepares a replacement without removing the last successful background', async () => {
  const previous = new Rect({ width: 100, height: 60 });
  previous.sniptaleRole = 'background';
  const canvas = createCanvas([previous]);
  let current = true;
  const prepared = await prepareEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({ backgroundMode: 'color' }),
    prepareObject: vi.fn(),
    isCurrent: () => current,
  });
  expect(canvas.getObjects()).toEqual([previous]);
  current = false;
  expect(prepared.apply()).toBe(false);
  expect(canvas.getObjects()).toEqual([previous]);
});

it('upgrades a transient background before accepting it and reuses completed final quality', async () => {
  const canvas = createCanvas();
  const options = {
    canvas: canvas as never,
    canvasSize: { width: 6000, height: 4000 },
    frame: createFrame({ backgroundMode: 'color' }),
    prepareObject: vi.fn(),
  };
  await syncEditorBackgroundLayer({ ...options, preview: true });
  const transient = canvas.getObjects()[0];
  await syncEditorBackgroundLayer(options);
  const final = canvas.getObjects()[0];
  expect(final).not.toBe(transient);
  expect(canvas.getObjects()).toHaveLength(1);
  await syncEditorBackgroundLayer(options);
  expect(canvas.getObjects()[0]).toBe(final);
  await syncEditorBackgroundLayer({ ...options, preview: true });
  expect(canvas.getObjects()[0]).toBe(final);
  expect(options.prepareObject).toHaveBeenCalledTimes(2);
  await syncEditorBackgroundLayer({
    ...options,
    frame: createFrame({ backgroundMode: 'color', backgroundColor: 'transparent' }),
  });
  expect(canvas.getObjects()).toHaveLength(0);
});
