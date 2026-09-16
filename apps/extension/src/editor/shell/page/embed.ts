import {
  createScenarioEditorEmbedCloseMessage,
  createScenarioEditorEmbedReadyMessage,
  createScenarioEditorEmbedErrorMessage,
  isEditorEmbedInitMessage,
  readEditorEmbedSession,
  type EditorEmbedMode,
} from '../../../features/editor/contracts/embed';
import type { ImageEditorController } from '../../controller';
import { waitForEditorControllerCanvas } from '../../controller/canvas-ready';
import { applyEditorRenderedImageToScenario } from '../../document/file-actions';

export function createEditorPageEmbedProviderValue(
  embedMode: EditorEmbedMode | null,
  controller: ImageEditorController
) {
  if (embedMode !== 'scenario') return { mode: null, onApply: null, onClose: null };
  return {
    mode: embedMode,
    onApply: async () => applyEditorRenderedImageToScenario(controller),
    onClose: () => {
      const sessionId = readEditorEmbedSession(window.location.search);
      if (sessionId)
        window.parent.postMessage(
          createScenarioEditorEmbedCloseMessage(sessionId),
          window.location.origin
        );
    },
  };
}

/** Receives one parent-bound document without activating standalone draft or library persistence. */
export function startScenarioEditorEmbed(args: {
  controller: ImageEditorController;
  setPageTitle: (title: string) => void;
}): () => void {
  const sessionId = readEditorEmbedSession(window.location.search);
  if (!sessionId || window.parent === window) return () => undefined;
  let active = true;
  let initialized = false;
  const receive = (event: MessageEvent<unknown>) => {
    if (
      !active ||
      initialized ||
      event.source !== window.parent ||
      event.origin !== window.location.origin ||
      !isEditorEmbedInitMessage(event.data) ||
      event.data.sessionId !== sessionId
    )
      return;
    initialized = true;
    const payload = event.data.payload;
    void (async () => {
      await waitForEditorControllerCanvas(args.controller);
      if (!active) return;
      args.setPageTitle(payload.title ?? '');
      if (payload.document) await args.controller.loadDocument(payload.document);
      else
        await args.controller.openImage(payload.dataUrl, undefined, {
          pageTitle: payload.title ?? '',
          browserFrameUrl: payload.url ?? '',
        });
    })().catch(() => {
      if (active)
        window.parent.postMessage(
          createScenarioEditorEmbedErrorMessage(sessionId),
          window.location.origin
        );
    });
  };
  window.addEventListener('message', receive);
  window.parent.postMessage(
    createScenarioEditorEmbedReadyMessage(sessionId),
    window.location.origin
  );
  return () => {
    active = false;
    window.removeEventListener('message', receive);
  };
}
