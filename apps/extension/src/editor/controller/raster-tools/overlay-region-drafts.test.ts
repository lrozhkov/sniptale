// @vitest-environment jsdom
import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { drawGradientDraft, drawLassoDraft, drawMarqueeDraft } from './overlay-region-drafts';

function createContext() {
  return {
    beginPath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createSnapshot() {
  const bitmap = document.createElement('canvas');
  bitmap.width = 10;
  bitmap.height = 20;
  return {
    bitmap,
    reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
    sceneBounds: { left: 10, top: 20, width: 100, height: 200 },
  };
}

beforeEach(() => {
  useEditorStore.setState({
    rasterToolSettings: {
      ...useEditorStore.getState().rasterToolSettings,
      gradientFrom: '#112233',
      gradientStops: [
        { color: '#112233', offset: 0 },
        { color: '#99aabb', offset: 0.5, opacity: 0.5 },
        { color: '#ffffff', offset: 1 },
      ],
      gradientTo: '#ffffff',
    },
  } as never);
});

it('draws marquee draft bitmap bounds in scene space', () => {
  const context = createContext();

  drawMarqueeDraft(context, {
    snapshot: createSnapshot(),
    startBitmapPoint: { x: 1, y: 2 },
    currentBitmapPoint: { x: 4, y: 8 },
  });

  expect(context.strokeRect).toHaveBeenCalledWith(20, 40, 30, 60);
});

it('draws lasso drafts with overlay styling', () => {
  const context = createContext();

  drawLassoDraft(context, {
    bitmapPoints: [],
    scenePoints: [new Point(1, 2), new Point(3, 4)],
    snapshot: createSnapshot(),
  });

  expect(context.lineTo).toHaveBeenCalledWith(3, 4);
  expect(context.stroke).toHaveBeenCalled();
});

it('draws gradient drafts with normalized translucent color stops', () => {
  const context = createContext();

  drawGradientDraft(context, {
    currentBitmapPoint: { x: 3, y: 4 },
    currentScenePoint: new Point(3, 4),
    snapshot: createSnapshot(),
    startBitmapPoint: { x: 1, y: 2 },
    startScenePoint: new Point(1, 2),
  });

  expect(context.fillRect).toHaveBeenCalledWith(10, 20, 100, 200);
  expect(
    (
      context.createLinearGradient as unknown as {
        mock: { results: Array<{ value: { addColorStop: ReturnType<typeof vi.fn> } }> };
      }
    ).mock.results[0]?.value.addColorStop
  ).toHaveBeenCalledWith(0.5, 'rgba(153, 170, 187, 0.15)');
});
