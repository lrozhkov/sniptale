import type { EditorDocument } from '../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../document/model/render-options';
import type { EditorSessionAutosaveService } from '../../document/session-autosave';
import type { OpenImageOptions } from '../core/types';
import {
  closeEditorDocumentViaController,
  copyRenderedEditorImageViaController,
  exportEditorDocumentViaController,
  loadEditorDocumentViaController,
  openEditorImageViaController,
  renderEditorControllerToDataUrl,
} from '../public-api';
import type { EditorControllerPublicApiAdapter } from '../public-api/types';

export interface EditorDocumentCommandController<TAdapter = EditorControllerPublicApiAdapter> {
  autosaveService: Pick<EditorSessionAutosaveService, 'discardDraft' | 'persistSnapshot'> | null;
  exportDocument(): EditorDocument;
  getPublicApiAdapter(): TAdapter;
}

interface EditorDocumentCommandOperations<TAdapter = EditorControllerPublicApiAdapter> {
  closeDocument(controller: TAdapter): void;
  copyRenderedImage(controller: TAdapter, options?: EditorRenderedImageOptions): Promise<void>;
  exportDocument(controller: TAdapter): EditorDocument;
  loadDocument(controller: TAdapter, document: EditorDocument): Promise<void>;
  openImage(
    controller: TAdapter,
    dataUrl: string,
    sourceName?: string | null,
    options?: OpenImageOptions
  ): Promise<void>;
  renderToDataUrl(controller: TAdapter, options: EditorRenderToDataUrlOptions): string;
}

export interface EditorDocumentCommandService<TAdapter = EditorControllerPublicApiAdapter> {
  closeDocument(controller: EditorDocumentCommandController<TAdapter>): void;
  copyRenderedImage(
    controller: EditorDocumentCommandController<TAdapter>,
    options?: EditorRenderedImageOptions
  ): Promise<void>;
  exportDocument(controller: EditorDocumentCommandController<TAdapter>): EditorDocument;
  loadDocument(
    controller: EditorDocumentCommandController<TAdapter>,
    document: EditorDocument
  ): Promise<void>;
  openImage(
    controller: EditorDocumentCommandController<TAdapter>,
    dataUrl: string,
    sourceName?: string | null,
    options?: OpenImageOptions
  ): Promise<void>;
  renderToDataUrl(
    controller: EditorDocumentCommandController<TAdapter>,
    options: EditorRenderToDataUrlOptions
  ): string;
}

interface EditorDocumentCommandServiceDependencies<TAdapter> {
  logDiscardDraftError?: (error: unknown) => void;
  operations: EditorDocumentCommandOperations<TAdapter>;
}

interface EditorDocumentCommandDefaultDependencies {
  logDiscardDraftError?: (error: unknown) => void;
}

const defaultOperations: EditorDocumentCommandOperations = {
  closeDocument: closeEditorDocumentViaController,
  copyRenderedImage: copyRenderedEditorImageViaController,
  exportDocument: exportEditorDocumentViaController,
  loadDocument: loadEditorDocumentViaController,
  openImage: openEditorImageViaController,
  renderToDataUrl: renderEditorControllerToDataUrl,
};

const logger = createLogger({ namespace: 'EditorControllerDocument' });

function persistAutosaveSnapshot<TAdapter>(
  controller: EditorDocumentCommandController<TAdapter>
): Promise<void> {
  return (
    controller.autosaveService?.persistSnapshot(() => controller.exportDocument()) ??
    Promise.resolve()
  );
}

function discardDraftOnClose<TAdapter>(
  controller: EditorDocumentCommandController<TAdapter>,
  logDiscardDraftError: (error: unknown) => void
): void {
  const discardDraftPromise = controller.autosaveService?.discardDraft();
  if (!discardDraftPromise) {
    return;
  }

  void discardDraftPromise.catch(logDiscardDraftError);
}

function buildEditorDocumentCommandService<TAdapter>(args: {
  logDiscardDraftError: (error: unknown) => void;
  operations: EditorDocumentCommandOperations<TAdapter>;
}): EditorDocumentCommandService<TAdapter> {
  return {
    async openImage(controller, dataUrl, sourceName = null, options = {}) {
      await args.operations.openImage(
        controller.getPublicApiAdapter(),
        dataUrl,
        sourceName,
        options
      );
      await persistAutosaveSnapshot(controller);
    },

    async loadDocument(controller, document) {
      await args.operations.loadDocument(controller.getPublicApiAdapter(), document);
      await persistAutosaveSnapshot(controller);
    },

    closeDocument(controller) {
      discardDraftOnClose(controller, args.logDiscardDraftError);
      args.operations.closeDocument(controller.getPublicApiAdapter());
    },

    exportDocument(controller) {
      return args.operations.exportDocument(controller.getPublicApiAdapter());
    },

    renderToDataUrl(controller, options) {
      return args.operations.renderToDataUrl(controller.getPublicApiAdapter(), options);
    },

    async copyRenderedImage(controller, options) {
      await args.operations.copyRenderedImage(controller.getPublicApiAdapter(), options);
    },
  };
}

function resolveDiscardDraftLogger(
  dependencies: EditorDocumentCommandDefaultDependencies
): (error: unknown) => void {
  return (
    dependencies.logDiscardDraftError ??
    ((error: unknown) => {
      logger.error('Failed to discard editor draft on close', error);
    })
  );
}

export function createEditorDocumentCommandService(
  dependencies?: EditorDocumentCommandDefaultDependencies
): EditorDocumentCommandService;
export function createEditorDocumentCommandService<TAdapter>(
  dependencies: EditorDocumentCommandServiceDependencies<TAdapter>
): EditorDocumentCommandService<TAdapter>;
export function createEditorDocumentCommandService<TAdapter>(
  dependencies:
    | EditorDocumentCommandDefaultDependencies
    | EditorDocumentCommandServiceDependencies<TAdapter> = {}
): EditorDocumentCommandService | EditorDocumentCommandService<TAdapter> {
  const logDiscardDraftError = resolveDiscardDraftLogger(dependencies);
  if ('operations' in dependencies) {
    return buildEditorDocumentCommandService({
      logDiscardDraftError,
      operations: dependencies.operations,
    });
  }

  return buildEditorDocumentCommandService({
    logDiscardDraftError,
    operations: defaultOperations,
  });
}
