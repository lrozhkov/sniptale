// @vitest-environment jsdom

import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import {
  convertBackgroundDuplicateToAnnotation,
  resetFrameBackgroundDraft,
  syncManagedBackgroundLayerLayout,
  syncEditorBackgroundLayer,
} from './';

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
      if (index >= 0) {
        objects.splice(index, 1);
        objects.unshift(object);
      }
    }),
  };
}

function createFrame(patch: Partial<EditorFrameSettings>): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#112233',
    ...patch,
  };
}

it('materializes color backgrounds as a managed canvas layer behind the source', async () => {
  const source = new Rect({ width: 120, height: 80 });
  source.sniptaleRole = 'source';
  source.sniptaleType = 'source-image';
  const canvas = createCanvas([source]);

  await syncEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({ backgroundMode: 'color' }),
    prepareObject: vi.fn(),
  });

  const [background, sourceLayer] = canvas.getObjects();
  expect(sourceLayer).toBe(source);
  expect(background).toMatchObject({
    fill: '#112233',
    sniptaleBackgroundMode: 'color',
    sniptaleLocked: true,
    sniptaleRole: 'background',
    sniptaleType: 'background',
  });
});

it('resets frame draft fields and converts duplicate backgrounds to annotations', () => {
  const duplicate = new Rect({ width: 100, height: 60 });
  duplicate.sniptaleRole = 'background';
  duplicate.sniptaleType = 'background';
  duplicate.sniptaleBackgroundMode = 'gradient';

  convertBackgroundDuplicateToAnnotation(duplicate);

  expect(resetFrameBackgroundDraft()).toEqual({
    backgroundColor: 'transparent',
    backgroundGradientAngle: 145,
    backgroundGradientColorStops: [
      { color: '#7c2d12', offset: 0 },
      { color: '#f59e0b', offset: 1 },
    ],
    backgroundGradientFrom: '#7c2d12',
    backgroundGradientStops: ['#7c2d12', '#f59e0b'],
    backgroundGradientTo: '#f59e0b',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'gradient',
  });
  expect(duplicate.sniptaleRole).toBe('annotation');
  expect(duplicate.sniptaleType).toBe('rectangle');
  expect(duplicate.sniptaleBackgroundMode).toBeUndefined();
});

it('removes existing backgrounds and ignores stale async sync results', async () => {
  const background = new Rect({ width: 100, height: 60 });
  background.sniptaleRole = 'background';
  background.sniptaleType = 'background';
  const canvas = createCanvas([background]);

  await syncEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({ backgroundColor: 'transparent', backgroundMode: 'color' }),
    prepareObject: vi.fn(),
  });
  await syncEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({ backgroundMode: 'color' }),
    prepareObject: vi.fn(),
    createMutationToken: vi.fn(() => 1),
    isMutationTokenCurrent: vi.fn(() => false),
  });

  expect(canvas.getObjects()).toEqual([]);
});

it('resizes managed gradient backgrounds synchronously during scene relayout', () => {
  const background = new Rect({ width: 120, height: 80 });
  background.sniptaleBackgroundMode = 'gradient';
  background.sniptaleRole = 'background';
  background.sniptaleType = 'background';
  background.set = vi.fn();
  background.setCoords = vi.fn();

  syncManagedBackgroundLayerLayout({
    canvas: createCanvas([background]) as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({ backgroundGradientAngle: 45, backgroundMode: 'gradient' }),
  });

  expect(background.set).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: expect.objectContaining({ type: 'linear' }),
      height: 180,
      left: 0,
      top: 0,
      width: 320,
    })
  );
  expect(background.setCoords).toHaveBeenCalledOnce();
});

it('resizes managed image backgrounds only when the current asset and fit still match', () => {
  const background = {
    height: 50,
    sniptaleBackgroundFit: 'cover',
    sniptaleBackgroundImageData: 'data:image/png;base64,abc',
    sniptaleBackgroundMode: 'image',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
    width: 100,
  };
  const canvas = createCanvas([background as never]);

  syncManagedBackgroundLayerLayout({
    canvas: canvas as never,
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({
      backgroundImageData: 'data:image/png;base64,abc',
      backgroundImageFit: 'cover',
      backgroundMode: 'image',
    }),
  });
  syncManagedBackgroundLayerLayout({
    canvas: canvas as never,
    canvasSize: { width: 360, height: 220 },
    frame: createFrame({
      backgroundImageData: 'data:image/png;base64,abc',
      backgroundImageFit: 'contain',
      backgroundMode: 'image',
    }),
  });

  expect(background.set).toHaveBeenCalledWith(
    expect.objectContaining({
      left: -20,
      scaleX: 3.6,
      scaleY: 3.6,
      top: 0,
    })
  );
  expect(background.setCoords).toHaveBeenCalledOnce();
});
