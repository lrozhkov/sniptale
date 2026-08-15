import { expect, it, vi } from 'vitest';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { createFabricCanvasFixture } from '../../testing/fabric-canvas.test-support';
import { syncManagedBackgroundLayerLayout } from './layout';

function createFrame(patch: Partial<EditorFrameSettings>): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#112233',
    ...patch,
  };
}

function createCanvas(objects: unknown[]) {
  return {
    getObjects: () => objects,
  };
}

it('updates tiled image backgrounds to the canvas bounds', () => {
  const background = {
    sniptaleBackgroundFit: 'tile',
    sniptaleBackgroundImageData: 'data:image/png;base64,abc',
    sniptaleBackgroundMode: 'image',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  syncManagedBackgroundLayerLayout({
    canvas: createFabricCanvasFixture(createCanvas([background])),
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({
      backgroundImageData: 'data:image/png;base64,abc',
      backgroundImageFit: 'tile',
      backgroundMode: 'image',
    }),
  });

  expect(background.set).toHaveBeenCalledWith({
    height: 180,
    left: 0,
    scaleX: 1,
    scaleY: 1,
    top: 0,
    width: 320,
  });
  expect(background.setCoords).toHaveBeenCalledOnce();
});

it('skips image relayout when the managed asset no longer matches the frame', () => {
  const background = {
    sniptaleBackgroundFit: 'cover',
    sniptaleBackgroundImageData: 'data:image/png;base64,old',
    sniptaleBackgroundMode: 'image',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  syncManagedBackgroundLayerLayout({
    canvas: createFabricCanvasFixture(createCanvas([background])),
    canvasSize: { width: 320, height: 180 },
    frame: createFrame({
      backgroundImageData: 'data:image/png;base64,new',
      backgroundImageFit: 'cover',
      backgroundMode: 'image',
    }),
  });

  expect(background.set).not.toHaveBeenCalled();
  expect(background.setCoords).not.toHaveBeenCalled();
});

it('leaves blurred backgrounds for the async rebuild owner during relayout', () => {
  const background = {
    sniptaleBackgroundBlurAmount: 8,
    sniptaleBackgroundMode: 'gradient',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  syncManagedBackgroundLayerLayout({
    canvas: createFabricCanvasFixture(createCanvas([background])),
    canvasSize: { width: 640, height: 360 },
    frame: createFrame({ backgroundBlurAmount: 8, backgroundMode: 'gradient' }),
  });

  expect(background.set).not.toHaveBeenCalled();
  expect(background.setCoords).not.toHaveBeenCalled();
});
