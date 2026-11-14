import { Rect, Point, util, type Canvas, type FabricObject } from 'fabric';
import {
  bindEditorDrawingArrowSnapping,
  type EditorArrowPointSnap,
} from '../../drawing/object/controls/arrow';
import {
  type DrawingSnapFeedback,
  type DrawingAlignmentGuide,
  type DrawingSnapRelation,
  type DrawingAlignmentAnchor,
  type DrawingAlignmentTarget,
  type DrawingPoint,
} from '../../../features/drawing/public';
import type { EditorTool, EditorWorkspaceSettings } from '../../../features/editor/document/types';
import { AligningGuidelines, type EditorMagnetTransformEvent } from './aligning-guidelines';
import { getEditorMovePosition, resolveEditorMoveSnap, type EditorSnapTarget } from './move-axis';
import { DEFAULT_EDITOR_MAGNET_OPTIONS } from './options';
import { collectMagnetTargets, isMagnetTarget } from './targets';
import { applyEditorBoxResizeSnap, resolveEditorRectResizeSnap } from './resize';
import { projectMagnetGuides, type MagnetGuideProjection } from './guide-projection';

export interface EditorMagnetManager {
  clearGuides(): void;
  dispose(): void;
  hasActiveGuides(): boolean;
  getVisualFeedback(): DrawingSnapFeedback;
  snapPoint(input: Parameters<EditorArrowPointSnap>[0]): DrawingPoint;
  snapRect(input: {
    excludeId?: string;
    rect: { x: number; y: number; width: number; height: number };
  }): { x: number; y: number; width: number; height: number };
  snapResizeRect?(input: {
    direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
    excludeId?: string;
    minimumSize: number;
    rect: { x: number; y: number; width: number; height: number };
  }): { x: number; y: number; width: number; height: number };
}

interface EditorMagnetManagerOptions {
  canvas: Canvas;
  getActiveTool: () => EditorTool;
  getCanvasDocumentSize: () => { width: number; height: number };
  getCropGuide: () => FabricObject | null;
  getWorkspace: () => EditorWorkspaceSettings;
}

class EditorWorkspaceMagnetManager extends AligningGuidelines implements EditorMagnetManager {
  private visualFeedback: DrawingSnapFeedback = emptyFeedback();
  private readonly identities = new WeakMap<FabricObject, string>();
  private nextIdentity = 0;
  private feedbackTool: EditorTool | null = null;
  private readonly unbindArrowSnap: () => void;
  private readonly disposeFeedbackInput: () => void;

  private readonly externalSnapTarget = new Rect({
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
  });

  constructor(private readonly managerOptions: EditorMagnetManagerOptions) {
    super(managerOptions.canvas, {
      ...DEFAULT_EDITOR_MAGNET_OPTIONS,
      getObjectsByTarget: (target) =>
        collectMagnetTargets(target, this.managerOptions.getCanvasDocumentSize()),
    });
    this.unbindArrowSnap = bindEditorDrawingArrowSnapping(managerOptions.canvas, (input) =>
      this.snapPoint(input)
    );
    const clear = () => this.clearFeedbackAfterInput();
    const modifier = (event: KeyboardEvent) => {
      if (event.key === 'Alt' || event.key === 'Escape') clear();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', clear);
      window.addEventListener('pointercancel', clear);
      window.addEventListener('keydown', modifier);
      window.addEventListener('keyup', modifier);
    }
    this.canvas.upperCanvasEl?.addEventListener?.('lostpointercapture', clear);
    this.disposeFeedbackInput = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', clear);
        window.removeEventListener('pointercancel', clear);
        window.removeEventListener('keydown', modifier);
        window.removeEventListener('keyup', modifier);
      }
      this.canvas.upperCanvasEl?.removeEventListener?.('lostpointercapture', clear);
    };
  }

  moving(event: EditorMagnetTransformEvent) {
    const move =
      this.managerOptions.getCropGuide() === null && isMagnetTarget(event.target)
        ? getEditorMovePosition(event)
        : null;
    if (move) {
      if (!event.target.lockMovementX) event.target.set('left', move.left);
      if (!event.target.lockMovementY) event.target.set('top', move.top);
      event.target.setCoords();
    }
    if (!this.shouldHandleEvent(event.target)) {
      this.clearGuides();
      return;
    }

    const previous = this.getVisualFeedback();
    this.clearGuides();
    if (event.e?.altKey) return;
    this.updateScreenMargin();
    const target = event.target;
    const box = target.getBoundingRect();
    const source = [
      ...target.getCoords().map((point) => ({ kind: 'edge' as const, point })),
      { kind: 'center' as const, point: target.getCenterPoint() },
    ];
    const result = resolveEditorMoveSnap({
      lockedAxes: [
        ...(target.lockMovementX ? ['x' as const] : []),
        ...(target.lockMovementY ? ['y' as const] : []),
      ],
      sourceId: this.describeTarget(target).target.id,
      source,
      targets: [...collectMagnetTargets(target, this.managerOptions.getCanvasDocumentSize())].map(
        (object) => this.describeTarget(object)
      ),
      threshold: this.margin / this.canvas.getZoom(),
      previous,
      bounds: { x: box.left, y: box.top, width: box.width, height: box.height },
      ...(move?.lockedAxis
        ? { lockedAxis: move.lockedAxis === 'top' ? ('y' as const) : ('x' as const) }
        : {}),
    });
    const center = target.getCenterPoint();
    target.setXY(
      new Point(center.x + result.delta.x, center.y + result.delta.y),
      'center',
      'center'
    );
    target.setCoords();
    this.publishFeedback(result);
  }

  scalingOrResizing(event: EditorMagnetTransformEvent) {
    if (!this.shouldHandleEvent(event.target) || event.e?.altKey) {
      this.clearGuides();
      return;
    }

    this.updateScreenMargin();
    const previous = this.getVisualFeedback();
    this.clearGuides();
    const feedback = applyEditorBoxResizeSnap({
      event,
      previous,
      sourceId: this.describeTarget(event.target).target.id,
      targets: this.resizeTargets(event.target),
      threshold: this.margin / this.canvas.getZoom(),
    });
    if (feedback) {
      this.publishFeedback(feedback);
      return;
    }
    super.scalingOrResizing(event);
    this.publishFeedback({
      ...emptyFeedback(),
      guides: this.projectResizeGuides(event.target, event.transform.corner),
    });
  }

  afterRender() {
    if (!this.managerOptions.getWorkspace().magnetEnabled) {
      this.clearGuides();
      return;
    }

    if (!this.hasTopContext()) {
      return;
    }

    // The viewport chrome projects guides into a sharp screen-space SVG layer.
  }

  beforeRender() {
    if (!this.hasTopContext()) {
      return;
    }

    super.beforeRender();
  }

  dispose(): void {
    this.disposeFeedbackInput();
    this.unbindArrowSnap();
    this.clearGuides();
    super.dispose();
  }

  hasActiveGuides(): boolean {
    const feedback = this.getVisualFeedback();
    return feedback.guides.length > 0 || feedback.relations.length > 0;
  }

  private publishFeedback(feedback: DrawingSnapFeedback): void {
    this.feedbackTool = this.managerOptions.getActiveTool();
    this.visualFeedback = {
      guides: feedback.guides,
      relations: feedback.relations,
      acceptedByAxis: feedback.acceptedByAxis,
    };
  }

  getVisualFeedback(): DrawingSnapFeedback {
    if (
      !this.managerOptions.getWorkspace().magnetEnabled ||
      this.managerOptions.getCropGuide() ||
      (this.feedbackTool !== null && this.feedbackTool !== this.managerOptions.getActiveTool())
    )
      this.clearGuides();
    return this.visualFeedback;
  }

  mouseUp(): void {
    this.clearFeedbackAfterInput();
  }

  private clearFeedbackAfterInput(): void {
    const hadFeedback =
      this.verticalLines.size > 0 ||
      this.horizontalLines.size > 0 ||
      this.onlyDrawPoint ||
      this.visualFeedback.guides.length > 0 ||
      this.visualFeedback.relations.length > 0;
    this.clearGuides();
    if (hadFeedback) this.canvas.requestRenderAll?.();
  }

  private describeTarget(object: FabricObject): EditorSnapTarget {
    let id = object.sniptaleId ?? this.identities.get(object);
    if (!id) {
      id = object.sniptaleType ? `object:${++this.nextIdentity}` : 'workspace';
      this.identities.set(object, id);
    }
    const rect = object.getBoundingRect();
    const target: DrawingAlignmentTarget = {
      id,
      kind: object.sniptaleType ? 'object' : 'workspace',
      bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    };
    const anchors: DrawingAlignmentAnchor[] = object
      .getCoords()
      .map((point) => ({ kind: 'point', point }));
    anchors.push({ kind: 'center', point: object.getCenterPoint() });
    if (object.controls['start'] && object.controls['end']) {
      const coords = object.calcOCoords();
      const inverse = util.invertTransform(this.canvas.viewportTransform);
      const start = coords['start'],
        end = coords['end'];
      if (start && end) {
        const a = new Point(start.x, start.y).transform(inverse),
          b = new Point(end.x, end.y).transform(inverse);
        return {
          target,
          anchors: [
            { kind: 'point', point: a },
            { kind: 'point', point: b },
            { kind: 'center', point: a.add(b).scalarDivide(2) },
          ],
        };
      }
    }
    return { target, anchors };
  }

  getCaCheMapValue(object: FabricObject): Point[] {
    const description = this.describeTarget(object);
    return description.anchors.map((anchor) =>
      Object.assign(new Point(anchor.point.x, anchor.point.y), {
        alignment: { target: description.target, kind: anchor.kind },
      })
    );
  }

  private resizeTargets(target: FabricObject) {
    return [...collectMagnetTargets(target, this.managerOptions.getCanvasDocumentSize())].map(
      (object) => ({ object, description: this.describeTarget(object) })
    );
  }

  private projectResizeGuides(target: FabricObject, corner: string): MagnetGuideProjection {
    if (target.flipX)
      corner = corner.includes('l') ? corner.replace('l', 'r') : corner.replace('r', 'l');
    if (target.flipY)
      corner = corner.includes('t') ? corner.replace('t', 'b') : corner.replace('b', 't');
    const point = Object.entries(this.getPointMap(target)).find(([key]) => key === corner)?.[1];
    if (!point) return [];
    const rect = target.getBoundingRect();
    return projectMagnetGuides(this.verticalLines, this.horizontalLines, {
      anchors: [{ kind: 'point', point }],
      bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      screenScale: (6 / this.margin) * this.canvas.getZoom(),
    });
  }

  private updateScreenMargin(): void {
    const screenWidth = this.canvas.upperCanvasEl?.getBoundingClientRect?.().width;
    if (!screenWidth || screenWidth <= 0) return;
    const logicalWidth = this.canvas.getWidth();
    if (logicalWidth > 0) this.margin = 6 / (screenWidth / logicalWidth);
  }

  snapPoint(input: Parameters<EditorArrowPointSnap>[0]): DrawingPoint {
    const target = this.configureExternalSnapTarget({
      ...(input.excludeId ? { excludeId: input.excludeId } : {}),
      rect: { x: input.point.x, y: input.point.y, width: 0, height: 0 },
    });
    const previous = this.getVisualFeedback();
    this.clearGuides();
    if (input.bypass || !this.shouldHandleEvent(target)) return input.point;
    this.updateScreenMargin();
    const threshold = this.margin / this.canvas.getZoom();
    const result = resolveEditorMoveSnap({
      sourceId: input.excludeId ?? 'arrow-point',
      source: [{ kind: 'point', point: input.point }],
      bounds: { x: input.point.x, y: input.point.y, width: 0, height: 0 },
      targets: [...collectMagnetTargets(target, this.managerOptions.getCanvasDocumentSize())].map(
        (object) => this.describeTarget(object)
      ),
      threshold,
      previous,
    });
    let delta = result.delta;
    if (input.preserveAngle) {
      const dx = input.point.x - input.origin.x,
        dy = input.point.y - input.origin.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) return input.point;
      const direction = { x: dx / length, y: dy / length };
      const amounts = result.guides
        .map((guide) =>
          Math.abs(direction[guide.axis]) > 1e-6
            ? delta[guide.axis] / direction[guide.axis]
            : Infinity
        )
        .filter((amount) => Math.abs(amount) <= threshold)
        .sort((a, b) => Math.abs(a) - Math.abs(b));
      if (amounts[0] === undefined) return input.point;
      delta = { x: amounts[0] * direction.x, y: amounts[0] * direction.y };
    }
    const point = { x: input.point.x + delta.x, y: input.point.y + delta.y };
    const guides = result.guides
      .filter((guide) => Math.abs(point[guide.axis] - guide.coordinate) < 1e-6)
      .map((guide) => ({
        ...guide,
        matches:
          guide.matches?.map((match) => ({ ...match, source: { ...match.source, point } })) ?? [],
      }));
    this.publishFeedback({
      ...emptyFeedback(),
      guides,
      acceptedByAxis: Object.fromEntries(
        guides.map((guide) => [guide.axis, result.acceptedByAxis[guide.axis]])
      ),
    });
    this.canvas.requestRenderAll();
    return point;
  }

  snapRect(input: {
    excludeId?: string;
    rect: { x: number; y: number; width: number; height: number };
  }) {
    const target = this.configureExternalSnapTarget(input);
    this.moving({ target } as unknown as EditorMagnetTransformEvent);
    this.canvas.requestRenderAll();
    return {
      x: Number(target.left ?? input.rect.x),
      y: Number(target.top ?? input.rect.y),
      width: input.rect.width,
      height: input.rect.height,
    };
  }

  snapResizeRect(input: {
    direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
    excludeId?: string;
    minimumSize: number;
    rect: { x: number; y: number; width: number; height: number };
  }) {
    const target = this.configureExternalSnapTarget(input);
    const previous = this.getVisualFeedback();
    this.clearGuides();
    const enabled = this.shouldHandleEvent(target);
    this.updateScreenMargin();
    const result = resolveEditorRectResizeSnap({
      ...input,
      previous,
      sourceId: this.describeTarget(target).target.id,
      targets: enabled ? this.resizeTargets(target) : [],
      threshold: this.margin / this.canvas.getZoom(),
    });
    this.publishFeedback(result.feedback);
    this.canvas.requestRenderAll();
    return result.rect;
  }

  private shouldHandleEvent(target: FabricObject): boolean {
    return (
      this.managerOptions.getWorkspace().magnetEnabled &&
      this.managerOptions.getCropGuide() === null &&
      isMagnetTarget(target)
    );
  }

  private configureExternalSnapTarget(input: {
    excludeId?: string;
    rect: { x: number; y: number; width: number; height: number };
  }): Rect {
    const target = this.externalSnapTarget;
    target.set({
      height: input.rect.height,
      left: input.rect.x,
      scaleX: 1,
      scaleY: 1,
      top: input.rect.y,
      width: input.rect.width,
    });
    if (input.excludeId === undefined) delete target.sniptaleId;
    else target.sniptaleId = input.excludeId;
    target.canvas = this.canvas;
    target.setCoords();
    return target;
  }

  clearGuides(): void {
    this.verticalLines.clear();
    this.horizontalLines.clear();
    this.cacheMap.clear();
    this.onlyDrawPoint = false;
    this.visualFeedback = emptyFeedback();
    this.feedbackTool = null;
  }

  private hasTopContext(): boolean {
    return this.canvas.contextTop != null;
  }
}

function emptyFeedback(): {
  guides: DrawingAlignmentGuide[];
  relations: DrawingSnapRelation[];
  acceptedByAxis: DrawingSnapFeedback['acceptedByAxis'];
} {
  return { guides: [], relations: [], acceptedByAxis: {} };
}

export function createEditorMagnetManager(
  options: EditorMagnetManagerOptions
): EditorMagnetManager {
  return new EditorWorkspaceMagnetManager(options);
}
