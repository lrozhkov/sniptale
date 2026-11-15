import { getEditorRasterRuntime } from '../../raster-editing/runtime';
import type { RasterComputeClient } from '../../raster-editing/compute';
import type { EditorSimplifyCompute } from '../../drawing/simplify-runtime';
import {
  createEditorDocumentCommandService,
  type EditorDocumentCommandService,
} from '../document-commands';
import { ImageEditorControllerSceneActions } from './controller-scene-actions';
import type { EditorControllerInstance } from '../instance/types';
import { createEditorControllerEventBindings } from '../instance/bindings';
import { createEditorControllerEventHandlers, type EditorControllerEventHandlers } from '../events';
import { createEditorVectorBackingStore } from '../../../composition/persistence/vector-elements';
import { validateEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  createEditorVectorCommands,
  type EditorVectorPublisher,
} from '../public-api/vector-elements';
import { createEditorVectorClipboard } from '../public-api/vector-element-clipboard';

export interface ImageEditorControllerServices {
  documentCommands?: EditorDocumentCommandService;
  createSimplifyCompute?: () => EditorSimplifyCompute;
  createRasterCompute?: () => RasterComputeClient;
  vectorElements?: EditorVectorPublisher;
}

export class ImageEditorController extends ImageEditorControllerSceneActions {
  private readonly documentCommands: EditorDocumentCommandService;
  readonly createSimplifyCompute?: () => EditorSimplifyCompute;
  readonly createRasterCompute?: () => RasterComputeClient;
  readonly eventHandlers: EditorControllerEventHandlers;
  private readonly vectorCommands: ReturnType<typeof createEditorVectorCommands>;
  private readonly vectorClipboard: ReturnType<typeof createEditorVectorClipboard>;

  constructor(services: ImageEditorControllerServices = {}) {
    super();
    if (services.createRasterCompute) this.createRasterCompute = services.createRasterCompute;
    if (services.createSimplifyCompute) this.createSimplifyCompute = services.createSimplifyCompute;
    this.documentCommands = services.documentCommands ?? createEditorDocumentCommandService();
    const vectorPublisher =
      services.vectorElements ??
      createEditorVectorBackingStore({ validateDefinition: validateEditorVectorDefinition });
    this.vectorCommands = createEditorVectorCommands(this, vectorPublisher);
    this.vectorClipboard = createEditorVectorClipboard(this, vectorPublisher, () =>
      this.vectorCommands.cancelVectorStyleEdit()
    );
    this.eventHandlers = createEditorControllerEventHandlers(
      createEditorControllerEventBindings(this)
    );
  }

  /** Insert a published vector at a scene point, or at the visible document center. */
  insertVectorElement(
    definition: EditorVectorDefinition,
    position?: { x: number; y: number },
    colors?: Readonly<Record<string, string>>,
    style?: { opacity: number; strokeScale: number }
  ): Promise<boolean> {
    return this.vectorCommands.insertVectorElement(definition, position, colors, style);
  }

  /** Prepare selected vector bindings once before a palette or opacity gesture. */
  beginVectorStyleEdit() {
    return this.vectorCommands.beginVectorStyleEdit();
  }

  /** Copy selected vector resources into this controller's in-app clipboard. */
  copyVectorSelection(): Promise<boolean> {
    return this.vectorClipboard.copyVectorSelection();
  }

  /** Report current selection support and the accepted in-app clipboard payload. */
  getVectorClipboardAvailability() {
    return this.vectorClipboard.getAvailability();
  }

  /** Restore an independent selection from the in-app resource closure. */
  pasteVectorSelection(position?: { x: number; y: number }): Promise<boolean> {
    return this.vectorClipboard.pasteVectorSelection(position);
  }

  override duplicateSelection(): Promise<void> {
    return this.vectorCommands.duplicateWithAcceptedVectorStyle(() => super.duplicateSelection());
  }

  /** Return the runtime mounted for this controller canvas. */
  getRasterRuntime() {
    return this.canvas ? getEditorRasterRuntime(this.canvas) : null;
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
