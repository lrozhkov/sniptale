import type { Point } from 'fabric';
import { type FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../features/editor/document/types';

import type { DrawSession } from './types';
import {
  addObjectForController,
  advanceStepValueForController,
  applyToolModeForController,
  cancelTransientInteractionForController,
  commitHistoryForController,
  getActiveCropRectForController,
  moveSelectionForController,
  moveSelectionToEdgeForController,
  nextLabelIndexForController,
  refreshActiveToolSettingsPreviewForController,
  startDrawSessionForController,
  switchToSelectToolForController,
  withHistoryMutedForController,
} from '../instance/helpers';
import { ImageEditorControllerSceneHelperActions } from './controller-scene-helper-actions';

export abstract class ImageEditorControllerInteractionHelperActions extends ImageEditorControllerSceneHelperActions {
  cancelTransientInteraction() {
    return cancelTransientInteractionForController(this.instance);
  }

  startDrawSession(tool: DrawSession['tool'], start: Point, object: FabricObject): void {
    startDrawSessionForController(this.instance, tool, start, object);
  }

  getActiveCropRect() {
    return getActiveCropRectForController(this.instance);
  }

  addObject(object: FabricObject): void {
    addObjectForController(this.instance, object);
  }

  moveSelection(direction: 1 | -1): void {
    moveSelectionForController(this.instance, direction);
  }

  moveSelectionToEdge(edge: 'front' | 'back'): void {
    moveSelectionToEdgeForController(this.instance, edge);
  }

  withHistoryMuted<T>(callback: () => T): T {
    return withHistoryMutedForController(this.instance, callback);
  }

  commitHistory(): void {
    commitHistoryForController(this.instance);
  }

  applyToolMode(): void {
    applyToolModeForController(this.instance);
  }

  refreshActiveToolSettingsPreview(): void {
    refreshActiveToolSettingsPreviewForController(this.instance);
  }

  switchToSelectTool(): void {
    switchToSelectToolForController(this.instance);
  }

  nextLabelIndex(type: EditorObjectType) {
    return nextLabelIndexForController(this.instance, type);
  }

  advanceStepValue(): void {
    advanceStepValueForController();
  }
}
