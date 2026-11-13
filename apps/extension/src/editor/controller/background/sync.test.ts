import { applyImageSettings } from '../../objects/image-style';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../features/editor/document/constants';
import * as backgroundObjects from './objects';
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

it('retains raster source state through fit, tile, blur and canvas-size rebuilds', async () => {
  const image = 'data:image/png;base64,QUJDRA==';
  const previous = new Rect({ width: 8, height: 6 });
  previous.sniptaleRole = 'background';
  previous.sniptaleType = 'background';
  previous.sniptaleBackgroundMode = 'image';
  previous.sniptaleBackgroundImageData = image;
  previous.sniptaleRasterOriginalData = image;
  previous.sniptaleRasterState = {
    version: 1,
    width: 12,
    height: 8,
    crop: { x: 2, y: 1, width: 8, height: 6 },
  };
  const canvas = createCanvas([previous]);
  const create = vi
    .spyOn(backgroundObjects, 'createBackgroundLayer')
    .mockImplementation(async () => new Rect({ width: 8, height: 6 }));
  try {
    for (const [index, fit] of (['contain', 'tile', 'cover'] as const).entries()) {
      await syncEditorBackgroundLayer({
        canvas: canvas as never,
        canvasSize: { width: 320 + index, height: 180 + index },
        frame: createFrame({
          backgroundMode: 'image',
          backgroundImageData: image,
          backgroundImageFit: fit,
          backgroundBlurAmount: index * 3,
        }),
        prepareObject: vi.fn(),
      });
      expect(canvas.getObjects()[0]?.sniptaleRasterState).toEqual(previous.sniptaleRasterState);
      expect(canvas.getObjects()[0]?.sniptaleRasterOriginalData).toBe(image);
    }
    expect(create).toHaveBeenCalledTimes(3);
  } finally {
    create.mockRestore();
  }
});

it('prepares an explicit managed candidate without accepted mutation then refuses replaced identity', async () => {
  const previous = new Rect();
  previous.sniptaleId = 'bg';
  previous.sniptaleRole = 'background';
  previous.sniptaleType = 'background';
  previous.sniptaleBackgroundMode = 'image';
  previous.sniptaleBackgroundImageData = 'data:image/png;base64,QUJDRA==';
  const next = new Rect();
  vi.spyOn(backgroundObjects, 'createBackgroundLayer').mockResolvedValueOnce(next);
  const canvas = createCanvas([previous]);
  const candidate = {
    targetId: 'bg',
    expectedObject: previous,
    metadata: {
      sniptaleRasterOriginalData: 'data:image/png;base64,QUJDRA==',
      sniptaleRasterState: {
        version: 1 as const,
        width: 10,
        height: 8,
        crop: { x: 2, y: 1, width: 6, height: 4 },
      },
    },
    effects: [{ id: 'brightness' as const, enabled: true, amount: 0.2 }],
    derivedImageData: 'data:image/png;base64,RUZHSA==',
    flipX: true,
    flipY: false,
  };
  const prepared = await prepareEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 120, height: 80 },
    frame: createFrame({
      backgroundMode: 'image',
      backgroundImageData: candidate.derivedImageData,
    }),
    candidate,
    prepareObject: vi.fn(),
  });
  expect(prepared.previewObject).toBe(next);
  expect(canvas.getObjects()).toEqual([previous]);
  expect(next.sniptaleRasterState).toEqual(candidate.metadata.sniptaleRasterState);
  expect(next.flipX).toBe(true);
  canvas.remove(previous);
  expect(prepared.apply()).toBe(false);
  expect(canvas.getObjects()).toEqual([]);
});

it('retains accepted image style and world pose for same-crop pixel and correction candidates', async () => {
  const previous = new Rect({
    width: 200,
    height: 120,
    left: 17,
    top: 11,
    angle: 23,
    scaleX: 1.3,
    scaleY: 0.8,
    skewX: 7,
    opacity: 0.42,
    flipX: true,
  });
  previous.sniptaleId = 'styled';
  previous.sniptaleRole = 'background';
  previous.sniptaleType = 'background';
  previous.sniptaleBackgroundMode = 'image';
  previous.sniptaleBackgroundImageData = 'data:image/png;base64,QUJDRA==';
  applyImageSettings(previous, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    opacity: 0.42,
    radius: 9,
    strokeWidth: 3,
  });
  const metadata = {
    sniptaleRasterOriginalData: 'data:image/png;base64,QUJDRA==',
    sniptaleRasterState: {
      version: 1 as const,
      width: 10,
      height: 8,
      crop: { x: 0, y: 0, width: 10, height: 8 },
    },
  };
  Object.assign(previous, metadata);
  const next = new Rect({ width: 200, height: 120 });
  vi.spyOn(backgroundObjects, 'createBackgroundLayer').mockResolvedValueOnce(next);
  const canvas = createCanvas([previous]);
  const candidate = {
    targetId: 'styled',
    expectedObject: previous,
    metadata,
    effects: [],
    derivedImageData: 'data:image/png;base64,RUZHSA==',
    flipX: true,
    flipY: false,
  };
  const prepared = await prepareEditorBackgroundLayer({
    canvas: canvas as never,
    canvasSize: { width: 200, height: 120 },
    frame: createFrame({
      backgroundMode: 'image',
      backgroundImageData: candidate.derivedImageData,
    }),
    candidate,
    prepareObject: vi.fn(),
  });
  expect(prepared.apply()).toBe(true);
  expect(next.opacity).toBe(0.42);
  expect(next.sniptaleImageRadius).toBe(9);
  expect(next.sniptaleImageStrokeWidth).toBe(3);
  next
    .calcTransformMatrix()
    .forEach((value, index) =>
      expect(value).toBeCloseTo(previous.calcTransformMatrix()[index]!, 8)
    );
});

it.each(['target', 'other', 'none'] as const)(
  'retains explicit candidate target selection without stealing %s selection',
  async (selected) => {
    const previous = new Rect({ width: 40, height: 30 });
    previous.sniptaleId = 'bg';
    previous.sniptaleType = 'background';
    previous.sniptaleRole = 'background';
    previous.sniptaleBackgroundMode = 'image';
    previous.sniptaleBackgroundImageData = 'data:image/png;base64,QUJDRA==';
    const other = new Rect();
    const next = new Rect({ width: 40, height: 30 });
    let active: Rect | undefined =
      selected === 'target' ? previous : selected === 'other' ? other : undefined;
    const base = createCanvas([previous, other]);
    const canvas = {
      ...base,
      getActiveObjects: () => (active ? [active] : []),
      setActiveObject: vi.fn((object: Rect) => {
        active = object;
      }),
      remove: vi.fn((object: Rect) => {
        base.remove(object);
        if (active === object) active = undefined;
      }),
    };
    vi.spyOn(backgroundObjects, 'createBackgroundLayer').mockResolvedValueOnce(next);
    const candidate = {
      targetId: 'bg',
      expectedObject: previous,
      metadata: {
        sniptaleRasterOriginalData: 'data:image/png;base64,QUJDRA==',
        sniptaleRasterState: {
          version: 1 as const,
          width: 10,
          height: 8,
          crop: { x: 0, y: 0, width: 10, height: 8 },
        },
      },
      effects: [],
      derivedImageData: 'data:image/png;base64,RUZHSA==',
      flipX: false,
      flipY: false,
    };
    const prepared = await prepareEditorBackgroundLayer({
      canvas: canvas as never,
      canvasSize: { width: 40, height: 30 },
      frame: createFrame({
        backgroundMode: 'image',
        backgroundImageData: candidate.derivedImageData,
      }),
      candidate,
      prepareObject: vi.fn(),
    });
    expect(prepared.apply()).toBe(true);
    if (selected === 'target') {
      expect(active).toBe(next);
      expect(canvas.setActiveObject).toHaveBeenCalledExactlyOnceWith(next);
    } else {
      expect(canvas.setActiveObject).not.toHaveBeenCalled();
      expect(active).toBe(selected === 'other' ? other : undefined);
    }
  }
);

it('disposes an unapplied candidate if its replacement observer throws', async () => {
  const previous = new Rect({ width: 4, height: 4 });
  previous.sniptaleRole = 'background';
  previous.sniptaleType = 'background';
  previous.sniptaleId = 'background';
  const canvas = createCanvas([previous]),
    next = new Rect({ width: 4, height: 4 }),
    dispose = vi.spyOn(next, 'dispose');
  const create = vi.spyOn(backgroundObjects, 'createBackgroundLayer').mockResolvedValueOnce(next);
  const candidate = {
    targetId: 'background',
    expectedObject: previous,
    metadata: {
      sniptaleRasterState: {
        version: 1 as const,
        width: 4,
        height: 4,
        crop: { x: 0, y: 0, width: 4, height: 4 },
      },
      sniptaleRasterOriginalData: 'data:image/png;base64,QUJDRA==',
    },
    effects: [],
    derivedImageData: 'data:image/png;base64,QUJDRA==',
    flipX: false,
    flipY: false,
    observeReplacement: () => {
      throw new Error('controlled observer failure');
    },
  };
  try {
    const prepared = await prepareEditorBackgroundLayer({
      canvas: canvas as never,
      canvasSize: { width: 4, height: 4 },
      frame: createFrame({
        backgroundMode: 'image',
        backgroundImageData: candidate.derivedImageData,
      }),
      candidate,
      prepareObject: vi.fn(),
    });
    expect(() => prepared.apply()).toThrow('controlled observer failure');
    expect(canvas.getObjects()).toEqual([previous]);
    expect(canvas.remove).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    create.mockRestore();
  }
});
