import { flushEditorFreehandCompletion } from '../draw-workflow/released';
import { type FabricObject } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';

import type { ApplyDocumentOptions } from './types';
import {
  applyDocumentForController,
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
    flushEditorFreehandCompletion(this.canvas);
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
    flushEditorFreehandCompletion(this.canvas);
    relayoutSceneForController(this.instance, frame, browserFrame, options);
  }

  prepareObject(object: FabricObject): void {
    initializeObjectForController(this.instance, object);
  }

  applyDocument(document: EditorDocument, options: ApplyDocumentOptions) {
    flushEditorFreehandCompletion(this.canvas);
    return applyDocumentForController(this.instance, document, options);
  }

  rebuildFrameDecorations() {
    flushEditorFreehandCompletion(this.canvas);
    return rebuildFrameDecorationsForController(this.instance);
  }

  sendFrameObjectsToBack(): void {
    flushEditorFreehandCompletion(this.canvas);
    sendFrameObjectsToBackForController(this.instance);
  }
}
