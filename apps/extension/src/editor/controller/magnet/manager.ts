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
}

interface EditorMagnetManagerOptions {
  canvas: Canvas;
  getActiveTool: () => EditorTool;
  getCanvasDocumentSize: () => { width: number; height: number };
  getCropGuide: () => FabricObject | null;
  getWorkspace: () => EditorWorkspaceSettings;
}

class EditorWorkspaceMagnetManager extends AligningGuidelines implements EditorMagnetManager {
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
    const target = new Rect({
      left: input.rect.x,
      top: input.rect.y,
      width: input.rect.width,
      height: input.rect.height,
      originX: 'left',
      originY: 'top',
      strokeWidth: 0,
    });
    if (input.excludeId !== undefined) target.sniptaleId = input.excludeId;
    target.sniptaleType = 'rectangle';
    target.canvas = this.canvas;
    this.moving({ target } as unknown as EditorMagnetTransformEvent);
    this.canvas.requestRenderAll();
    return {
      x: Number(target.left ?? input.rect.x),
      y: Number(target.top ?? input.rect.y),
      width: input.rect.width,
      height: input.rect.height,
    };
  }

  private shouldHandleEvent(target: FabricObject): boolean {
    return (
      this.managerOptions.getWorkspace().magnetEnabled &&
      this.managerOptions.getCropGuide() === null &&
      isMagnetTarget(target)
    );
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

export function createEditorMagnetManager(
  options: EditorMagnetManagerOptions
): EditorMagnetManager {
  return new EditorWorkspaceMagnetManager(options);
}
