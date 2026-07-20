type FabricBrushMockHooks = {
  finalizeAndAddPath?: () => void;
  saveAndTransform?: (ctx: unknown) => void;
  superRender?: (ctx?: unknown) => void;
};

let hooks: FabricBrushMockHooks = {};

export function setFabricBrushMockHooks(nextHooks: FabricBrushMockHooks) {
  hooks = nextHooks;
}

export class PencilBrush {
  canvas: unknown;
  color = '';
  drawStraightLine = false;
  decimate = 0;
  shadow: unknown = null;
  width = 1;
  protected _hasStraightLine = false;
  protected _points: Array<{ x: number; y: number }> = [];

  constructor(canvas: unknown) {
    this.canvas = canvas;
  }

  onMouseDown(point: { x: number; y: number }) {
    this._reset();
    this._addPoint(point);
  }

  onMouseMove(point: { x: number; y: number }) {
    this._addPoint(point);
  }

  onMouseUp() {
    this._finalizeAndAddPath();
    return false;
  }

  needsFullRender() {
    return false;
  }

  _addPoint(point: { x: number; y: number }) {
    this._points.push(point);
    return true;
  }

  _reset() {
    this._points = [];
  }

  _finalizeAndAddPath() {
    hooks.finalizeAndAddPath?.();
  }

  _saveAndTransform(ctx: unknown) {
    hooks.saveAndTransform?.(ctx);
  }

  _render(ctx?: unknown) {
    hooks.superRender?.(ctx);
  }
}

export class Point {
  constructor(
    public x: number,
    public y: number
  ) {}

  eq(other: { x: number; y: number }) {
    return this.x === other.x && this.y === other.y;
  }
}
