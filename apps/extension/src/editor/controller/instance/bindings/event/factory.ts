import type { EditorControllerInstance } from '../../types';
import { createEditorControllerEventCommandBindings } from './commands';
import { createEditorControllerEventObjectBindings } from './object';
import {
  createEventCanvasStateBindings,
  createEventCropStateBindings,
  createEventDocumentStateBindings,
  createEventInteractionStateBindings,
} from './state';
import type { RasterCommandController } from './types';

export function createEditorControllerEventBindings(controller: EditorControllerInstance) {
  return {
    ...createEventCanvasStateBindings(controller),
    ...createEventCropStateBindings(controller),
    ...createEventDocumentStateBindings(controller),
    ...createEventInteractionStateBindings(controller),
    ...createEditorControllerEventObjectBindings(controller),
    ...createEditorControllerEventCommandBindings(controller as RasterCommandController),
  };
}
