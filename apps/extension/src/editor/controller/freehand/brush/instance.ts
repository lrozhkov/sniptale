import { PencilBrush, type Point } from 'fabric';
import type { FreehandPointRecord } from '../points';
import type { FreehandStrokeSample } from '../samples';
import {
  appendFreehandPointSample,
  mergeDenseDynamicWidthPoint,
  resolveFreehandStrokePoints,
  resolveFreehandStrokeSamples,
  resolvePointerTimestamp,
} from '../brush-samples';
import { renderDynamicWidthFreehandPreview } from '../brush-rendering';

export class EditorFreehandBrush extends PencilBrush {
  declare protected _points: Point[];
  private committedPoints: FreehandPointRecord[] = [];
  private committedStrokeSamples: FreehandStrokeSample[] = [];
  private currentTimestamp = 0;
  dynamicWidth = false;
  private strokeSamples: FreehandStrokeSample[] = [];
  smoothingLevel = 0;

  override onMouseDown(pointer: Point, options: Parameters<PencilBrush['onMouseDown']>[1]): void {
    this.currentTimestamp = resolvePointerTimestamp(options.e);
    super.onMouseDown(pointer, options);
  }

  override onMouseMove(pointer: Point, options: Parameters<PencilBrush['onMouseMove']>[1]): void {
    this.currentTimestamp = resolvePointerTimestamp(options.e);
    super.onMouseMove(pointer, options);
  }

  override onMouseUp(options: Parameters<PencilBrush['onMouseUp']>[0]): boolean {
    this.currentTimestamp = resolvePointerTimestamp(options.e);
    return super.onMouseUp(options);
  }

  override needsFullRender(): boolean {
    return this.dynamicWidth || super.needsFullRender();
  }

  override _reset(): void {
    super._reset();
    this.strokeSamples = [];
  }

  override _addPoint(point: Point): boolean {
    if (this._points.length > 1 && point.eq(this._points[this._points.length - 1]!)) {
      return false;
    }

    if (this.drawStraightLine && this._points.length > 1) {
      this._hasStraightLine = true;
      this._points.pop();
      this.strokeSamples.pop();
    }

    if (
      mergeDenseDynamicWidthPoint({
        currentTimestamp: this.currentTimestamp,
        dynamicWidth: this.dynamicWidth,
        point,
        points: this._points,
        strokeSamples: this.strokeSamples,
      })
    ) {
      return true;
    }

    this._points.push(point);
    appendFreehandPointSample({
      currentTimestamp: this.currentTimestamp,
      point,
      strokeSamples: this.strokeSamples,
    });
    return true;
  }

  override _finalizeAndAddPath(): void {
    const resolvedSamples = this.resolveCommittedStrokeSamples();
    this.committedStrokeSamples = resolvedSamples.map((sample) => ({ ...sample }));
    this.committedPoints = resolveFreehandStrokePoints(resolvedSamples);
    super._finalizeAndAddPath();
  }

  override _render(ctx = this.canvas.contextTop): void {
    if (!this.dynamicWidth || this._points.length < 2) {
      super._render(ctx);
      return;
    }

    const rendered = renderDynamicWidthFreehandPreview({
      color: this.color,
      context: ctx,
      samples: this.resolveCommittedStrokeSamples(),
      saveAndTransform: (context) => this._saveAndTransform(context),
      smoothingLevel: this.smoothingLevel,
      width: this.width,
    });
    if (!rendered) {
      super._render(ctx);
    }
  }

  consumeCommittedPoints(): FreehandPointRecord[] | null {
    return this.committedPoints.length > 0
      ? this.committedPoints.map((point) => ({ ...point }))
      : null;
  }

  consumeCommittedStrokeSamples(): FreehandStrokeSample[] | null {
    return this.committedStrokeSamples.length > 0
      ? this.committedStrokeSamples.map((sample) => ({ ...sample }))
      : null;
  }

  private resolveCommittedStrokeSamples(): FreehandStrokeSample[] {
    return resolveFreehandStrokeSamples({
      currentTimestamp: this.currentTimestamp,
      points: this._points,
      strokeSamples: this.strokeSamples,
    });
  }
}
