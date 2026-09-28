import type { EditorEmbedMode } from '../../../features/editor/contracts/embed';
import type { EditorBootstrapPayload } from '../../../workflows/editor/bootstrap';
import { createImageEditorController, type ImageEditorController } from '../../controller';
import { waitForEditorControllerCanvas } from '../../controller/canvas-ready';
import { beginEditorDocumentOpenOperation } from '../../document/file-actions/operation';
import {
  createEditorSessionAutosaveService,
  type EditorSessionAutosaveService,
} from '../../document/session-autosave';
import {
  ensureEditorPageAggregateId,
  readEditorPageLocationState,
  resolveEditorPageRestoreSource,
} from '../../document/page-session';
export { loadEditorPageDefaults } from './defaults';

interface EditorPageSessionRuntime {
  isCancelled: () => boolean;
  setPageTitle: (pageTitle: string) => void;
}

export type EditorPageServices = {
  autosaveService: EditorSessionAutosaveService;
  bootstrapRevision: number;
  controller: ImageEditorController;
};

/** Gallery presentation is a preview; editable source and objects are saved separately. */
function getAutosavePresentationSize(size: { width: number; height: number }) {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function beginEditorPageBootstrapRevision(services: EditorPageServices): number {
  services.bootstrapRevision = (services.bootstrapRevision ?? 0) + 1;
  return services.bootstrapRevision;
}

function isCurrentEditorPageBootstrapRevision(
  services: EditorPageServices,
  revision: number
): boolean {
  return services.bootstrapRevision === revision;
}

function isEditorPageBootstrapAborted(
  runtime: EditorPageSessionRuntime,
  services: EditorPageServices,
  revision: number
) {
  return runtime.isCancelled() || !isCurrentEditorPageBootstrapRevision(services, revision);
}

async function openRestoredEditorAsset(
  restoreSource: Extract<
    Awaited<ReturnType<typeof resolveEditorPageRestoreSource>>,
    { kind: 'asset' }
  >,
  runtime: EditorPageSessionRuntime,
  services: EditorPageServices
) {
  services.autosaveService.updateContext({
    sourceUrl: restoreSource.sourceUrl,
    sourceTitle: restoreSource.sourceTitle,
  });
  runtime.setPageTitle(restoreSource.sourceTitle);
  await services.controller.openImage(restoreSource.dataUrl, restoreSource.filename, {
    browserFrameUrl: restoreSource.sourceUrl,
    pageTitle: restoreSource.sourceTitle,
    sourceFaviconUrl: restoreSource.sourceFaviconUrl,
  });
}

export function resolveEditorPageSessionSeed() {
  const locationState = readEditorPageLocationState();
  const aggregateId = ensureEditorPageAggregateId(locationState);

  return {
    locationState,
    aggregateId,
  };
}

export function createEditorPageServices(
  embedMode: EditorEmbedMode | null = null
): EditorPageServices {
  const controller = createImageEditorController();
  const autosaveService = createEditorSessionAutosaveService();
  if (embedMode !== 'scenario') controller.autosaveService = autosaveService;

  return {
    autosaveService,
    bootstrapRevision: 0,
    controller,
  };
}

export async function openEditorBootstrapPayload(
  payload: EditorBootstrapPayload,
  runtime: EditorPageSessionRuntime,
  services: EditorPageServices
): Promise<void> {
  beginEditorDocumentOpenOperation(services.controller);
  const bootstrapRevision = beginEditorPageBootstrapRevision(services);
  const { aggregateId } = resolveEditorPageSessionSeed();

  services.autosaveService.activate({
    aggregateId,
    durableRevision: 0,
    renderPresentation: () =>
      services.controller.renderForExport(
        {
          format: 'png',
          quality: 1,
          outputSize: getAutosavePresentationSize(services.controller.canvasDocumentSize),
        },
        'committed'
      ),
    sourceUrl: payload.url ?? '',
    sourceTitle: payload.title ?? '',
  });
  services.autosaveService.updateContext({
    sourceUrl: payload.url ?? '',
    sourceTitle: payload.title ?? '',
  });

  runtime.setPageTitle(payload.title ?? '');
  await waitForEditorControllerCanvas(services.controller);
  if (isEditorPageBootstrapAborted(runtime, services, bootstrapRevision)) {
    return;
  }

  if (payload.document) {
    await services.controller.loadDocument(payload.document);
    if (isEditorPageBootstrapAborted(runtime, services, bootstrapRevision)) return;
    const initialDocument = services.controller.exportDocument();
    await services.autosaveService.saveNow(() => initialDocument);
    return;
  }

  await services.controller.openImage(payload.dataUrl, undefined, {
    browserFrameUrl: payload.url ?? '',
    pageTitle: payload.title ?? '',
    sourceFaviconUrl: payload.sourceFaviconUrl ?? null,
  });
  if (isEditorPageBootstrapAborted(runtime, services, bootstrapRevision)) return;
  const initialDocument = services.controller.exportDocument();
  await services.autosaveService.saveNow(() => initialDocument);
}

export async function bootstrapEditorPageSession(
  runtime: EditorPageSessionRuntime,
  services: EditorPageServices
): Promise<void> {
  beginEditorDocumentOpenOperation(services.controller);
  const bootstrapRevision = beginEditorPageBootstrapRevision(services);
  const { aggregateId, locationState } = resolveEditorPageSessionSeed();

  services.autosaveService.activate({
    aggregateId,
    durableRevision: 0,
    renderPresentation: () =>
      services.controller.renderForExport(
        {
          format: 'png',
          quality: 1,
          outputSize: getAutosavePresentationSize(services.controller.canvasDocumentSize),
        },
        'committed'
      ),
    sourceUrl: null,
    sourceTitle: null,
  });

  const restoreSource = await resolveEditorPageRestoreSource(
    locationState,
    aggregateId,
    services.autosaveService,
    () => !isEditorPageBootstrapAborted(runtime, services, bootstrapRevision)
  );
  if (isEditorPageBootstrapAborted(runtime, services, bootstrapRevision)) {
    return;
  }

  await waitForEditorControllerCanvas(services.controller);
  if (isEditorPageBootstrapAborted(runtime, services, bootstrapRevision)) {
    return;
  }

  if (restoreSource.kind === 'draft') {
    runtime.setPageTitle(restoreSource.entry.sourceTitle ?? '');
    await services.controller.loadDocument(restoreSource.entry.document);
    return;
  }

  if (restoreSource.kind === 'bootstrap') {
    await openEditorBootstrapPayload(restoreSource.payload, runtime, services);
    return;
  }

  if (restoreSource.kind === 'asset') {
    await openRestoredEditorAsset(restoreSource, runtime, services);
  }
}

export function flushEditorAutosaveIfNeeded(
  services: EditorPageServices,
  hasImage: () => boolean
): void {
  if (!hasImage() || !services.controller.isDocumentReadyForExport()) {
    return;
  }

  void services.autosaveService.flushAutosave(() => services.controller.exportDocument());
}
