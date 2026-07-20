import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { syncEditorBackgroundLayer } from './sync';

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
