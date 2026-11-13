// @vitest-environment jsdom
import { FabricImage, Group, Rect } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../features/editor/document/constants';
import { createEditorRasterMetadata, decodeEditorRasterPixels } from './image-state';
import { createRasterTargetAdapter } from './adapters';

const source = 'data:image/png;base64,QUJDRA==';
function image() {
  const element = document.createElement('canvas');
  element.width = 16;
  element.height = 12;
  const image = new FabricImage(element, {
    left: 40,
    top: 30,
    scaleX: 2,
    scaleY: 1.5,
    angle: 25,
    flipX: true,
  });
  image.sniptaleId = 'target';
  image.sniptaleType = 'image';
  image.sniptaleRole = 'annotation';
  Object.assign(image, createEditorRasterMetadata(source, 16, 12));
  vi.spyOn(image, 'getSrc').mockReturnValue(source);
  return image;
}
function setup(object = image()) {
  const objects = [object];
  const canvas = {
    getObjects: () => objects,
    getActiveObjects: () => [object],
    add: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const commitNative = vi.fn();
  const publishBackground = vi.fn(async () => true);
  const adapter = createRasterTargetAdapter({
    canvas: () => canvas as never,
    frame: () => ({
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundMode: 'image',
      backgroundImageData: source,
    }),
    documentBounds: () => ({ x: 0, y: 0, width: 200, height: 120 }),
    prepareObject: vi.fn(),
    commitNative,
    publishBackground,
    flipObject: vi.fn(async () => {}),
  });
  return { adapter, object, objects, canvas, commitNative, publishBackground };
}
afterEach(() => vi.restoreAllMocks());

it('resolves exact native target, content permission, retained state and stale replacement', () => {
  const { adapter, object, objects } = setup();
  object.sniptaleLocked = true;
  object.sniptaleContentLocked = false;
  const target = adapter.resolve()!;
  expect(target.identity).toBe(object);
  expect(target.permission).toBe('allowed');
  expect(target.metadata.sniptaleRasterOriginalData).toBe(source);
  expect(adapter.isCurrent(target)).toBe(true);
  object.sniptaleContentLocked = true;
  expect(adapter.resolve()?.permission).toBe('blocked');
  expect(adapter.isCurrent(target)).toBe(false);
  object.sniptaleContentLocked = false;
  objects[0] = image();
  expect(adapter.isCurrent(target)).toBe(false);
});

it('allows content without clearing native position locks and commits once', () => {
  const { adapter, object, commitNative } = setup();
  object.sniptaleLocked = true;
  object.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true });
  const target = adapter.resolve()!;
  expect(target.permission).toBe('blocked');
  expect(adapter.allowContentEditing(target)).toBe(true);
  expect(object).toMatchObject({
    sniptaleLocked: true,
    sniptaleContentLocked: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
  });
  expect(commitNative).toHaveBeenCalledOnce();
});

it('publishes native planes with native transform and visible source placement intact', async () => {
  const { adapter, object, commitNative } = setup();
  const target = adapter.resolve()!;
  const transform = object.calcTransformMatrix();
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => image());
  expect(
    await adapter.publish(target, { metadata: target.metadata, visibleFullDataUrl: source })
  ).toBe(true);
  expect(object.calcTransformMatrix()).toEqual(transform);
  expect(object.sniptaleId).toBe('target');
  expect(object.sniptaleType).toBe('image');
  expect(object.sniptaleRasterOriginalData).toBe(source);
  expect(object.flipX).toBe(true);
  expect(commitNative).toHaveBeenCalledOnce();
});

it('crop keeps source coordinates fixed inside a transformed group', async () => {
  const object = image();
  const group = new Group([object], { left: 22, top: 12, angle: 17, scaleX: 1.4 });
  const { adapter, commitNative } = setup(object);
  group.sniptaleLocked = false;
  const target = adapter.resolve()!;
  const before = target.geometry.sourceToScene;
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => image());
  const metadata = {
    ...target.metadata,
    sniptaleRasterState: {
      ...target.metadata.sniptaleRasterState,
      crop: { x: 3, y: 2, width: 8, height: 6 },
    },
  };
  expect(await adapter.publish(target, { metadata, visibleFullDataUrl: source })).toBe(true);
  const after = adapter.resolve()!.geometry.sourceToScene;
  after.forEach((value, index) => expect(value).toBeCloseTo(before[index]!, 8));
  expect(commitNative).toHaveBeenCalledOnce();
});

it('decode failure and late source replacement publish no state or history', async () => {
  const { adapter, object, commitNative } = setup();
  const target = adapter.resolve()!;
  vi.spyOn(FabricImage, 'fromURL').mockRejectedValueOnce(new Error('decode'));
  await expect(
    adapter.publish(target, { metadata: target.metadata, visibleFullDataUrl: source })
  ).rejects.toThrow('decode');
  expect(commitNative).not.toHaveBeenCalled();
  expect(object.sniptaleRasterColorData).toBeUndefined();
  let finish!: (image: FabricImage) => void;
  vi.mocked(FabricImage.fromURL).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = adapter.publish(target, {
    metadata: target.metadata,
    visibleFullDataUrl: source,
  });
  object.sniptaleRasterColorData = source;
  finish(image());
  expect(await pending).toBe(false);
  expect(commitNative).not.toHaveBeenCalled();
});

it.each(['fit-width', 'contain', 'cover', 'stretch', 'fit-height', 'tile'] as const)(
  'keeps managed %s background identity and metadata',
  async (fit) => {
    const object = new Rect({ width: 200, height: 120 });
    object.sniptaleId = 'bg';
    object.sniptaleRole = 'background';
    object.sniptaleType = 'background';
    object.sniptaleBackgroundMode = 'image';
    object.sniptaleBackgroundImageData = source;
    object.sniptaleLocked = true;
    object.sniptaleContentLocked = false;
    object.flipX = true;
    Object.assign(object, createEditorRasterMetadata(source, 16, 12));
    const canvas = { getObjects: () => [object], getActiveObjects: () => [object] };
    const publishBackground = vi.fn(async () => true);
    const adapter = createRasterTargetAdapter({
      canvas: () => canvas as never,
      frame: () => ({
        ...DEFAULT_EDITOR_FRAME_SETTINGS,
        backgroundImageFit: fit,
        backgroundBlurAmount: 8,
      }),
      documentBounds: () => ({ x: 0, y: 0, width: 200, height: 120 }),
      prepareObject: vi.fn(),
      commitNative: vi.fn(),
      publishBackground,
      flipObject: vi.fn(async () => {}),
    });
    const target = adapter.resolve()!;
    expect(target.kind).toBe('background');
    vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => image());
    expect(
      await adapter.publish(target, { metadata: target.metadata, visibleFullDataUrl: source })
    ).toBe(true);
    expect(publishBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedObject: object,
        targetId: 'bg',
        flipX: true,
        metadata: target.metadata,
      }),
      {}
    );
    expect(object.sniptaleType).toBe('background');
  }
);

it('refuses unadmitted resources and aborted work without accepted publication', async () => {
  const { adapter, object, commitNative } = setup();
  const target = adapter.resolve()!;
  await expect(
    adapter.publish(target, {
      metadata: target.metadata,
      visibleFullDataUrl: 'https://example.com/external.png',
    })
  ).rejects.toThrow('resource profile');
  const controller = new AbortController();
  controller.abort();
  await expect(
    adapter.publish(
      target,
      { metadata: target.metadata, visibleFullDataUrl: source },
      controller.signal
    )
  ).rejects.toThrow();
  expect(object.sniptaleRasterColorData).toBeUndefined();
  expect(commitNative).not.toHaveBeenCalled();
});

it('hydrates original tile dimensions transiently without writing retained metadata', async () => {
  const object = new Rect({ width: 200, height: 120 });
  object.sniptaleId = 'tile';
  object.sniptaleRole = 'background';
  object.sniptaleType = 'background';
  object.sniptaleBackgroundMode = 'image';
  object.sniptaleBackgroundImageData = source;
  object.sniptaleContentLocked = false;
  const canvas = { getObjects: () => [object], getActiveObjects: () => [object] };
  const adapter = createRasterTargetAdapter({
    canvas: () => canvas as never,
    frame: () => ({ ...DEFAULT_EDITOR_FRAME_SETTINGS, backgroundImageFit: 'tile' }),
    documentBounds: () => ({ x: 0, y: 0, width: 200, height: 120 }),
    prepareObject: vi.fn(),
    commitNative: vi.fn(),
    publishBackground: vi.fn(async () => true),
    flipObject: vi.fn(async () => {}),
  });
  expect(adapter.resolve()).toBeNull();
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => image());
  await adapter.hydrateTarget();
  expect(adapter.resolve()?.metadata.sniptaleRasterState).toMatchObject({ width: 16, height: 12 });
  expect(object.sniptaleRasterState).toBeUndefined();
});

it('copies only a fragment with its source affine while preserving other objects', async () => {
  const { adapter, object, canvas, commitNative } = setup();
  const target = adapter.resolve()!;
  const copy = image();
  copy.set({ width: 4, height: 3 });
  vi.spyOn(FabricImage, 'fromURL').mockResolvedValueOnce(copy);
  expect(await adapter.copy(target, source, { x: 2, y: 3, width: 4, height: 3 })).toBe(true);
  const added = canvas.add.mock.calls[0]?.[0];
  expect(added).toBe(copy);
  expect(added).toMatchObject({ sniptaleRole: 'annotation', sniptaleType: 'image' });
  expect(object.sniptaleRasterColorData).toBeUndefined();
  expect(commitNative).toHaveBeenCalledOnce();
  const matrix = copy.calcTransformMatrix(),
    geometry = target.geometry.sourceToScene;
  expect(matrix[0]).toBeCloseTo(geometry[0], 8);
  expect(matrix[1]).toBeCloseTo(geometry[1], 8);
  expect(matrix[4]).toBeCloseTo(geometry[0] * 4 + geometry[2] * 4.5 + geometry[4], 8);
  expect(matrix[5]).toBeCloseTo(geometry[1] * 4 + geometry[3] * 4.5 + geometry[5], 8);
});

it('rejects same-object style changes while background source preparation is pending', async () => {
  const object = new Rect({ width: 200, height: 120 });
  object.sniptaleId = 'bg';
  object.sniptaleRole = 'background';
  object.sniptaleType = 'background';
  object.sniptaleBackgroundMode = 'image';
  object.sniptaleBackgroundImageData = source;
  object.sniptaleContentLocked = false;
  Object.assign(object, createEditorRasterMetadata(source, 16, 12));
  const canvas = { getObjects: () => [object], getActiveObjects: () => [object] };
  const publishBackground = vi.fn(async () => true);
  const adapter = createRasterTargetAdapter({
    canvas: () => canvas as never,
    frame: () => ({ ...DEFAULT_EDITOR_FRAME_SETTINGS, backgroundImageFit: 'tile' }),
    documentBounds: () => ({ x: 0, y: 0, width: 200, height: 120 }),
    prepareObject: vi.fn(),
    commitNative: vi.fn(),
    publishBackground,
    flipObject: vi.fn(async () => {}),
  });
  const target = adapter.resolve()!;
  let finish!: (image: FabricImage) => void;
  vi.spyOn(FabricImage, 'fromURL').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = adapter.publish(target, {
    metadata: target.metadata,
    visibleFullDataUrl: source,
  });
  object.opacity = 0.35;
  finish(image());
  expect(await pending).toBe(false);
  expect(publishBackground).not.toHaveBeenCalled();
  expect(object.opacity).toBe(0.35);
  expect(object.sniptaleRasterColorData).toBeUndefined();
});

it('removes absent retained planes after Restore instead of reviving the previous mask', async () => {
  const { adapter, object } = setup();
  object.sniptaleRasterVisibilityData = source;
  object.sniptaleRasterKeyData = source;
  const target = adapter.resolve()!;
  const metadata = createEditorRasterMetadata(source, 16, 12);
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => image());
  expect(await adapter.publish(target, { metadata, visibleFullDataUrl: source })).toBe(true);
  expect(object.sniptaleRasterVisibilityData).toBeUndefined();
  expect(object.sniptaleRasterKeyData).toBeUndefined();
  expect(object.sniptaleRasterOriginalData).toBe(source);
});

it.each(['source-image', 'image'] as const)(
  'renders %s corrections once and retains raw source for later changes',
  async (type) => {
    const object = image();
    object.sniptaleType = type;
    object.sniptaleEffects = [{ id: 'brightness', enabled: true, amount: 0.2 }];
    const { adapter, commitNative } = setup(object);
    const target = adapter.resolve()!;
    const pixelImage = () => {
      const element = document.createElement('canvas');
      element.width = 16;
      element.height = 12;
      const context = element.getContext('2d')!;
      context.fillStyle = 'rgb(40,50,60)';
      context.fillRect(0, 0, 16, 12);
      return new FabricImage(element);
    };
    vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => pixelImage());
    expect(
      await adapter.publish(target, { metadata: target.metadata, visibleFullDataUrl: source })
    ).toBe(true);
    const element = object.getElement();
    expect(element).toBeInstanceOf(HTMLCanvasElement);
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected prepared pixels');
    expect([...element.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([
      91, 101, 111, 255,
    ]);
    const original = object._originalElement;
    if (!(original instanceof HTMLCanvasElement)) throw new Error('Expected original pixels');
    expect([...original.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([
      40, 50, 60, 255,
    ]);
    expect(object.sniptaleEffects).toEqual([{ id: 'brightness', enabled: true, amount: 0.2 }]);
    expect(commitNative).toHaveBeenCalledOnce();
  }
);

it('resolves a fresh native source without retained metadata after explicit row selection', async () => {
  const element = document.createElement('canvas');
  element.width = 20;
  element.height = 12;
  const sourceImage = new FabricImage(element, {
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
  });
  sourceImage.sniptaleId = 'fresh';
  sourceImage.sniptaleType = 'source-image';
  sourceImage.sniptaleRole = 'source';
  sourceImage.sniptaleLocked = true;
  sourceImage.sniptaleContentLocked = false;
  const { Canvas } = await import('fabric');
  const canvas = new Canvas(document.createElement('canvas'));
  try {
    canvas.add(sourceImage);
    canvas.setActiveObject(sourceImage);
    const adapter = createRasterTargetAdapter({
      canvas: () => canvas,
      frame: () => DEFAULT_EDITOR_FRAME_SETTINGS,
      documentBounds: () => ({ x: 0, y: 0, width: 20, height: 12 }),
      prepareObject: vi.fn(),
      commitNative: vi.fn(),
      publishBackground: vi.fn(async () => true),
      flipObject: vi.fn(async () => {}),
    });
    expect(adapter.resolve()).toMatchObject({
      identity: sourceImage,
      id: 'fresh',
      kind: 'source',
      permission: 'allowed',
      metadata: { sniptaleRasterState: { width: 20, height: 12 } },
    });
  } finally {
    await canvas.dispose();
  }
});

it('copies full-source corrections before cropping and masks only unselected fragment pixels', async () => {
  const element = document.createElement('canvas');
  element.width = 16;
  element.height = 12;
  const context = element.getContext('2d')!;
  context.fillStyle = 'rgb(40,50,60)';
  context.fillRect(0, 0, 16, 12);
  const full = element.toDataURL('image/png');
  const object = image();
  Object.assign(object, createEditorRasterMetadata(full, 16, 12));
  object.sniptaleEffects = [{ id: 'brightness', enabled: true, amount: 0.2 }];
  const { adapter, canvas, commitNative } = setup(object);
  const target = adapter.resolve()!;
  let loads = 0;
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async (source) => {
    const size = ++loads === 1 ? { width: 16, height: 12 } : { width: 4, height: 3 };
    const pixels = await decodeEditorRasterPixels(
      createEditorRasterMetadata(source, size.width, size.height)
    );
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d')!,
      rgba = context.createImageData(size.width, size.height);
    rgba.data.set(pixels.color);
    context.putImageData(rgba, 0, 0);
    return new FabricImage(canvas);
  });
  const selected = new Uint8Array(16 * 12).fill(255);
  selected[5 * 16 + 6] = 0;
  expect(
    await adapter.copy(target, full, { x: 4, y: 4, width: 4, height: 3 }, undefined, selected)
  ).toBe(true);
  const copy = canvas.add.mock.calls[0]?.[0];
  expect(copy).toBeInstanceOf(FabricImage);
  const output = copy.getElement();
  if (!(output instanceof HTMLCanvasElement)) throw new Error('Expected copied pixels');
  expect([...output.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([91, 101, 111, 255]);
  expect([...output.getContext('2d')!.getImageData(2, 1, 1, 1).data]).toEqual([0, 0, 0, 0]);
  expect(object.sniptaleRasterOriginalData).toBe(full);
  expect(commitNative).toHaveBeenCalledOnce();
});
