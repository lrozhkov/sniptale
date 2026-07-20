// @vitest-environment jsdom
import { FabricImage, Textbox } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  collectLayers,
  findObjectById,
  getLayerObjects,
  getObjectDimensions,
  getSourceObject,
} from './layers';

function createCanvas(objects: unknown[], activeObjects: unknown[] = []) {
  return {
    getActiveObjects: () => activeObjects,
    getObjects: () => objects,
  } as never;
}

function createSourceImage() {
  return {
    sniptaleId: 'source-image',
    sniptaleLabel: 'Source',
    sniptaleLocked: true,
    sniptaleRole: 'source',
    sniptaleType: 'source-image',
    visible: true,
  };
}

function createAnnotation() {
  return {
    sniptaleId: 'annotation-1',
    sniptaleLabel: 'Arrow 1',
    sniptaleLocked: false,
    sniptaleRole: 'annotation',
    sniptaleType: 'arrow',
    visible: true,
  };
}

function createGuideObject() {
  return {
    sniptaleId: 'helper',
    sniptaleLabel: 'Helper',
    sniptaleRole: 'crop-guide',
    sniptaleType: 'unknown',
    visible: true,
  };
}

function createBackgroundLayer() {
  return {
    fill: '#112233',
    sniptaleBackgroundMode: 'color',
    sniptaleId: 'background-1',
    sniptaleLabel: 'Scene background',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    stroke: '',
    visible: true,
  };
}

function createRasterImage() {
  const imageElement = document.createElement('img');
  imageElement.src = 'https://example.com/layer.png';
  return Object.assign(Object.create(FabricImage.prototype), {
    getElement: () => imageElement,
    getScaledHeight: () => 40,
    getScaledWidth: () => 80,
    sniptaleEffects: [{ amount: 0.2, enabled: true, id: 'brightness' }],
    sniptaleId: 'image-1',
    sniptaleLabel: 'Image 1',
    sniptaleLocked: false,
    sniptaleRole: 'annotation',
    sniptaleType: 'image',
    stroke: '',
    visible: true,
  });
}

function createColorLayer() {
  return {
    fill: '',
    getScaledHeight: () => 40,
    getScaledWidth: () => 80,
    sniptaleLabel: 'Color Layer',
    sniptaleRole: 'annotation',
    sniptaleType: 'rectangle',
    stroke: '#ff6600',
    visible: true,
  };
}

function createCanvasPreviewLayer() {
  const previewCanvas = document.createElement('canvas');
  vi.spyOn(previewCanvas, 'toDataURL').mockReturnValue('data:image/png;base64,canvas-preview');

  return Object.assign(Object.create(FabricImage.prototype), {
    getElement: () => previewCanvas,
    getScaledHeight: () => 30,
    getScaledWidth: () => 60,
    sniptaleId: 'image-canvas',
    sniptaleLabel: 'Canvas Image',
    sniptaleLocked: false,
    sniptaleRole: 'annotation',
    sniptaleType: 'image',
    visible: true,
  });
}

it('finds user layers and source layers through the canvas helpers', () => {
  const sourceImage = createSourceImage();
  const annotation = createAnnotation();
  const browserHeader = {
    sniptaleId: 'browser-header',
    sniptaleRole: 'annotation',
    sniptaleType: 'browser-frame',
    visible: true,
  };
  const canvas = createCanvas([sourceImage, annotation, browserHeader, createGuideObject()]);

  expect(findObjectById(canvas, 'annotation-1')).toBe(annotation);
  expect(findObjectById(canvas, 'missing')).toBeUndefined();
  expect(getLayerObjects(canvas)).toEqual([sourceImage, annotation, browserHeader]);
  expect(getSourceObject(canvas)).toBe(sourceImage);
});

it('uses scaled dimensions and fallback layer names when object metadata is incomplete', () => {
  const anonymousObject = {
    getScaledHeight: () => 48.2,
    getScaledWidth: () => 120.8,
    sniptaleRole: 'annotation',
    sniptaleType: 'rectangle',
    visible: true,
  };

  expect(getObjectDimensions(anonymousObject as never)).toEqual({ width: 121, height: 48 });
  const [layer] = collectLayers(createCanvas([anonymousObject]));

  expect(layer).toEqual(expect.objectContaining({ type: 'rectangle' }));
  expect(layer?.name.length).toBeGreaterThan(0);
});

it('uses stored callout dimensions for editor text layers', () => {
  const textLayer = Object.assign(Object.create(Textbox.prototype), {
    height: 40,
    sniptaleTextLayoutMode: 'fixed-width',
    sniptaleRole: 'annotation',
    sniptaleTextCalloutHeight: 120,
    sniptaleTextCalloutWidth: 420,
    sniptaleType: 'text',
    padding: 10,
    width: 120,
  });

  expect(getObjectDimensions(textLayer as never)).toEqual({ width: 420, height: 120 });
});

it('collects only user-visible canvas layers without the synthetic transparent base entry', () => {
  const sourceImage = createSourceImage();
  const annotation = createAnnotation();

  const layers = collectLayers(createCanvas([sourceImage, annotation], [annotation]));

  expect(layers).toEqual([
    expect.objectContaining({
      effectCount: 0,
      effects: [],
      id: 'annotation-1',
      immutable: false,
      locked: false,
      name: 'Arrow 1',
      previewTransparent: true,
      raster: false,
      selected: true,
      selectedCount: 1,
      type: 'arrow',
      visible: true,
    }),
    expect.objectContaining({
      effectCount: 0,
      effects: [],
      id: 'source-image',
      immutable: true,
      locked: true,
      name: 'Source',
      previewTransparent: true,
      raster: true,
      selected: false,
      selectedCount: 1,
      type: 'source-image',
      visible: true,
    }),
  ]);
  expect(layers.some((layer) => layer.id === 'transparent-base')).toBe(false);
});

it('collects the managed background as a normal selectable layer', () => {
  const background = createBackgroundLayer();
  const source = createSourceImage();
  const [sourceLayer, backgroundLayer] = collectLayers(createCanvas([background, source]));

  expect(sourceLayer).toEqual(expect.objectContaining({ type: 'source-image' }));
  expect(backgroundLayer).toEqual(
    expect.objectContaining({
      id: 'background-1',
      immutable: false,
      previewColor: '#112233',
      type: 'background',
      visible: true,
    })
  );
});

it('keeps the source layer immutable even when it is currently unlocked', () => {
  const unlockedSource = {
    ...createSourceImage(),
    sniptaleLocked: false,
  };
  const [layer] = collectLayers(createCanvas([unlockedSource]));

  expect(layer).toEqual(
    expect.objectContaining({
      immutable: true,
      locked: false,
      type: 'source-image',
    })
  );
});

it('collects preview metadata and effect counts for raster layers', () => {
  vi.stubGlobal(
    'crypto',
    Object.assign(globalThis.crypto, {
      randomUUID: () => 'generated-id',
    })
  );
  const image = createRasterImage();
  const [layer] = collectLayers(createCanvas([image]));

  expect(layer).toEqual(
    expect.objectContaining({
      effectCount: 1,
      id: 'image-1',
      previewDataUrl: 'https://example.com/layer.png',
      raster: true,
      type: 'image',
    })
  );
  expect(layer?.effects).toEqual([{ amount: 0.2, enabled: true, id: 'brightness' }]);
});

it('falls back to stroke colors and generated ids when layer metadata is incomplete', () => {
  vi.stubGlobal('crypto', { randomUUID: () => 'generated-id' });
  const [layer] = collectLayers(createCanvas([createColorLayer()]));

  expect(layer).toEqual(
    expect.objectContaining({
      id: 'generated-id',
      previewColor: '#ff6600',
      previewTransparent: false,
    })
  );
});

it('uses solid fills and canvas previews when they are available', () => {
  const fillLayer = {
    fill: '#00ff99',
    getScaledHeight: () => 20,
    getScaledWidth: () => 20,
    sniptaleId: 'fill-layer',
    sniptaleRole: 'annotation',
    sniptaleType: 'rectangle',
    visible: true,
  };
  const [canvasLayer, shapeLayer] = collectLayers(
    createCanvas([fillLayer, createCanvasPreviewLayer()])
  );

  expect(canvasLayer).toEqual(
    expect.objectContaining({
      previewDataUrl: 'data:image/png;base64,canvas-preview',
    })
  );
  expect(shapeLayer).toEqual(
    expect.objectContaining({
      previewColor: '#00ff99',
    })
  );
});
