import type { EditorBootstrapPayload } from '../../../workflows/editor/bootstrap';
import { createImageEditorController, type ImageEditorController } from '../../controller';
import { waitForEditorControllerCanvas } from '../../controller/canvas-ready';
import {
  createEditorSessionAutosaveService,
  type EditorSessionAutosaveService,
} from '../../document/session-autosave';
import {
  ensureEditorPageSessionId,
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
    assetId: restoreSource.assetId,
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
  const sessionId = ensureEditorPageSessionId(locationState);

  return {
    locationState,
    sessionId,
  };
}

export function createEditorPageServices(): EditorPageServices {
  const controller = createImageEditorController();
  const autosaveService = createEditorSessionAutosaveService();
  controller.autosaveService = autosaveService;

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
  const bootstrapRevision = beginEditorPageBootstrapRevision(services);
  const { locationState, sessionId } = resolveEditorPageSessionSeed();

  services.autosaveService.activate({
    sessionId,
    assetId: locationState.assetId,
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
    return;
  }

  await services.controller.openImage(payload.dataUrl, undefined, {
    browserFrameUrl: payload.url ?? '',
    pageTitle: payload.title ?? '',
    sourceFaviconUrl: payload.sourceFaviconUrl ?? null,
  });
}

export async function bootstrapEditorPageSession(
  runtime: EditorPageSessionRuntime,
  services: EditorPageServices
): Promise<void> {
  const bootstrapRevision = beginEditorPageBootstrapRevision(services);
  const { locationState, sessionId } = resolveEditorPageSessionSeed();

  services.autosaveService.activate({
    sessionId,
    assetId: locationState.assetId,
    sourceUrl: null,
    sourceTitle: null,
  });

  const restoreSource = await resolveEditorPageRestoreSource(
    locationState,
    sessionId,
    services.autosaveService
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
  if (!hasImage()) {
    return;
  }

  void services.autosaveService.flushAutosave(() => services.controller.exportDocument());
}
