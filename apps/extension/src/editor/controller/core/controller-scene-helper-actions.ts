import { type FabricObject } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
  EditorObjectType,
} from '../../../features/editor/document/types';

import type { ApplyDocumentOptions } from './types';
import {
  applyDocumentForController,
  decorateShapeForController,
  ensureBrowserFrameOnTopForController,
  initializeObjectForController,
  logBrowserFrameForController,
  rebuildFrameDecorationsForController,
  relayoutSceneForController,
  sendFrameObjectsToBackForController,
} from '../instance/helpers';
import { ImageEditorControllerViewportHelperActions } from './controller-viewport-helper-actions';

export abstract class ImageEditorControllerSceneHelperActions extends ImageEditorControllerViewportHelperActions {
  logBrowserFrame(stage: string, payload: Record<string, unknown> = {}): void {
    logBrowserFrameForController(stage, payload);
  }

  ensureBrowserFrameOnTop(): void {
    ensureBrowserFrameOnTopForController(this.instance);
  }

  relayoutScene(
    frame: EditorFrameSettings,
    browserFrame: BrowserFrameState,
    options: {
      canvasSize?: { width: number; height: number };
      sourceSize?: { width: number; height: number };
      preserveCanvasSize?: boolean;
      fitSourceToContent?: boolean;
    } = {}
  ): void {
    relayoutSceneForController(this.instance, frame, browserFrame, options);
  }

  prepareObject(object: FabricObject): void {
    initializeObjectForController(this.instance, object);
  }

  applyDocument(document: EditorDocument, options: ApplyDocumentOptions) {
    return applyDocumentForController(this.instance, document, options);
  }

  rebuildFrameDecorations() {
    return rebuildFrameDecorationsForController(this.instance);
  }

  sendFrameObjectsToBack(): void {
    sendFrameObjectsToBackForController(this.instance);
  }

  decorateShape(
    object: FabricObject,
    type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>
  ): void {
    decorateShapeForController(this.instance, object, type);
  }
}
