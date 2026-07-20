import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDynamicFreehandPathDataMock: vi.fn(() => [
    ['M', 1, 2],
    ['L', 3, 4],
    ['Q', 5, 6, 7, 8],
    ['Z'],
  ]),
  renderMock: vi.fn(),
  saveAndTransformMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  PencilBrush: class PencilBrush {
    canvas: unknown;
    color = '';
    dynamicWidth = false;
    smoothingLevel = 0;
    width = 1;
    protected _points: Array<{ x: number; y: number }> = [];

    constructor(canvas: unknown) {
      this.canvas = canvas;
    }

    _render() {
      mocks.renderMock();
    }

    _saveAndTransform() {
      mocks.saveAndTransformMock();
    }
  },
  Point: class Point {
    constructor(
      public x: number,
      public y: number
    ) {}
  },
}));

vi.mock('./dynamic-width', () => ({
  buildDynamicFreehandPathData: mocks.buildDynamicFreehandPathDataMock,
}));

import { Point } from 'fabric';
import { EditorFreehandBrush } from './brush';

describe('editor-controller freehand brush render seam', () => {
  it('renders dynamic-width previews through the filled path branch', () => {
    const brush = new EditorFreehandBrush({ getZoom: () => 1 } as never);
    const context = {
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      restore: vi.fn(),
    };

    brush.dynamicWidth = true;
    brush.color = '#123456';
    brush.width = 8;
    (brush as EditorFreehandBrush & { _points: Point[] })._points = [
      new Point(1, 2),
      new Point(3, 4),
    ];
    (brush as unknown as { _render: (ctx: unknown) => void })._render(context);

    expect(mocks.saveAndTransformMock).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledWith(1, 2);
    expect(context.lineTo).toHaveBeenCalledWith(3, 4);
    expect(context.quadraticCurveTo).toHaveBeenCalledWith(5, 6, 7, 8);
    expect(context.closePath).toHaveBeenCalledOnce();
    expect(context.fill).toHaveBeenCalledOnce();
  });
});
