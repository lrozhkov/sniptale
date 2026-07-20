import {
  createEditorDocumentCommandService,
  type EditorDocumentCommandService,
} from '../document-commands';
import { ImageEditorControllerSceneActions } from './controller-scene-actions';
import type { EditorControllerInstance } from '../instance/types';

export interface ImageEditorControllerServices {
  documentCommands?: EditorDocumentCommandService;
}

export class ImageEditorController extends ImageEditorControllerSceneActions {
  private readonly documentCommands: EditorDocumentCommandService;

  constructor(services: ImageEditorControllerServices = {}) {
    super();
    this.documentCommands = services.documentCommands ?? createEditorDocumentCommandService();
  }

  protected getControllerInstance(): EditorControllerInstance {
    return this;
  }

  protected getDocumentCommandService(): EditorDocumentCommandService {
    return this.documentCommands;
  }
}

export function createImageEditorController(
  services: ImageEditorControllerServices = {}
): ImageEditorController {
  return new ImageEditorController(services);
}
