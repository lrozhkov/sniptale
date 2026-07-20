// @vitest-environment jsdom
import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { drawBrushDraft, drawEraserDraft, drawHoverCursor } from './overlay-paint-drafts';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createDraft(referenceId: string) {
  const bitmap = document.createElement('canvas');
  return {
    bitmapPoints: [{ x: 1, y: 2 }],
    snapshot: {
      bitmap,
      reference: { kind: 'object' as const, objectId: referenceId, objectName: referenceId },
      sceneBounds: { left: 10, top: 20, width: 30, height: 40 },
    },
  };
}

describe('editor-controller/raster-tools/overlay-paint-drafts', () => {
  beforeEach(() => {
    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        brushSize: 18,
        eraserSize: 24,
      },
    } as never);
  });

  it('draws brush and eraser draft bitmaps from their snapshots', () => {
    const context = createContext();

    drawEraserDraft(context, createDraft('eraser-1'));
    drawBrushDraft(context, { ...createDraft('brush-1'), changed: true, createdTarget: true });

    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 10, 20, 30, 40);
  });

  it('draws hover cursor radius from the active raster tool setting', () => {
    const context = createContext();

    drawHoverCursor(context, { scenePoint: new Point(5, 6), tool: 'brush' });

    expect(context.arc).toHaveBeenNthCalledWith(1, 5, 6, 9, 0, Math.PI * 2);
    expect(context.arc).toHaveBeenNthCalledWith(2, 5, 6, 10.5, 0, Math.PI * 2);
  });
});
