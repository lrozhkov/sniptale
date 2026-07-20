import { expect, it, vi } from 'vitest';
import { drawShapeCompositionLayer } from './shape';

function createContext() {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('renders ellipse and rectangle shape overlays through dedicated branches', () => {
  const context = createContext();

  drawShapeCompositionLayer(context, createShape('ELLIPSE') as never, 0, 0, 80, 40);
  drawShapeCompositionLayer(context, createShape('RECTANGLE') as never, 0, 0, 80, 40);

  expect(context.ellipse).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalledTimes(2);
  expect(context.stroke).toHaveBeenCalledTimes(2);
});

it('renders line and arrow shape overlays as connector strokes', () => {
  const context = createContext();

  drawShapeCompositionLayer(context, createShape('LINE', 3) as never, 10, 20, 80, 4);
  drawShapeCompositionLayer(context, createShape('ARROW', 4, '#f60') as never, 10, 20, 80, 4);

  expect(context.moveTo).toHaveBeenNthCalledWith(1, 10, 22);
  expect(context.lineTo).toHaveBeenNthCalledWith(1, 90, 22);
  expect(context.lineTo).toHaveBeenCalledWith(90, 22);
  expect(context.closePath).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalledTimes(1);
  expect(context.stroke).toHaveBeenCalledTimes(2);
});

it('renders embedded shape assets from the loaded image bank', () => {
  const context = createContext();
  const image = {} as HTMLImageElement;

  drawShapeCompositionLayer(context, createEmbeddedAssetShape() as never, 20, 30, 200, 100, {
    badge: image,
  });

  expect(context.drawImage).toHaveBeenCalledWith(image, 40, 54, 60, 40);
  expect(context.save).toHaveBeenCalled();
  expect(context.restore).toHaveBeenCalled();
});

function createShape(shapeType: string, strokeWidth = 2, strokeColor = '#0f0') {
  return {
    shapeType,
    style: { borderRadius: 8, fillColor: '#f00', strokeColor, strokeWidth },
  };
}

function createEmbeddedAssetShape() {
  return {
    ...createShape('RECTANGLE'),
    embeddedAsset: {
      assetId: 'badge',
      opacity: 0.75,
      placement: { height: 20, width: 30, x: 10, y: 12 },
    },
    transform: { height: 50, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
  };
}
