import { Rect, type Canvas, type FabricObject } from 'fabric';
import type { EditorTool, EditorWorkspaceSettings } from '../../../features/editor/document/types';
import { AligningGuidelines, type EditorMagnetTransformEvent } from './aligning-guidelines';
import { DEFAULT_EDITOR_MAGNET_OPTIONS } from './options';
import { collectMagnetTargets, isMagnetTarget } from './targets';

export interface EditorMagnetManager {
  clearGuides(): void;
  dispose(): void;
  hasActiveGuides(): boolean;
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
  }

  moving(event: EditorMagnetTransformEvent) {
    if (!this.shouldHandleEvent(event.target)) {
      this.clearGuides();
      return;
    }

    super.moving(event);
  }

  scalingOrResizing(event: EditorMagnetTransformEvent) {
    if (!this.shouldHandleEvent(event.target)) {
      this.clearGuides();
      return;
    }

    super.scalingOrResizing(event);
  }

  afterRender() {
    if (!this.managerOptions.getWorkspace().magnetEnabled) {
      this.clearGuides();
      return;
    }

    if (!this.hasTopContext()) {
      return;
    }

    super.afterRender();
  }

  beforeRender() {
    if (!this.hasTopContext()) {
      return;
    }

    super.beforeRender();
  }

  dispose(): void {
    this.clearGuides();
    super.dispose();
  }

  hasActiveGuides(): boolean {
    return this.verticalLines.size > 0 || this.horizontalLines.size > 0 || this.onlyDrawPoint;
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
    const corner = RESIZE_CORNER_BY_DIRECTION[input.direction];
    const uniformKey = this.canvas.uniScaleKey ?? 'shiftKey';
    const event = {
      target,
      e: { [uniformKey]: this.canvas.uniformScaling },
      pointer: target.getCenterPoint(),
      transform: {
        action: 'resize',
        corner,
        original: { originX: 'left', originY: 'top' },
      },
    } as unknown as EditorMagnetTransformEvent;
    this.scalingOrResizing(event);
    this.canvas.requestRenderAll();
    return clampSnappedResizeRect(input, {
      x: Number(target.left ?? input.rect.x),
      y: Number(target.top ?? input.rect.y),
      width: Number(target.width ?? input.rect.width),
      height: Number(target.height ?? input.rect.height),
    });
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
  }

  private hasTopContext(): boolean {
    return this.canvas.contextTop != null;
  }
}

function clampSnappedResizeRect(
  input: {
    direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
    minimumSize: number;
    rect: { x: number; y: number; width: number; height: number };
  },
  snapped: { x: number; y: number; width: number; height: number }
) {
  const fixedRight = input.rect.x + input.rect.width;
  const fixedBottom = input.rect.y + input.rect.height;
  const snappedRight = snapped.x + snapped.width;
  const snappedBottom = snapped.y + snapped.height;
  const x = input.direction.includes('w')
    ? Math.min(snapped.x, fixedRight - input.minimumSize)
    : input.rect.x;
  const y = input.direction.includes('n')
    ? Math.min(snapped.y, fixedBottom - input.minimumSize)
    : input.rect.y;
  const right = input.direction.includes('e')
    ? Math.max(snappedRight, input.rect.x + input.minimumSize)
    : fixedRight;
  const bottom = input.direction.includes('s')
    ? Math.max(snappedBottom, input.rect.y + input.minimumSize)
    : fixedBottom;
  return { x, y, width: right - x, height: bottom - y };
}

const RESIZE_CORNER_BY_DIRECTION = {
  e: 'mr',
  n: 'mt',
  ne: 'tr',
  nw: 'tl',
  s: 'mb',
  se: 'br',
  sw: 'bl',
  w: 'ml',
} as const;

export function createEditorMagnetManager(
  options: EditorMagnetManagerOptions
): EditorMagnetManager {
  return new EditorWorkspaceMagnetManager(options);
}
