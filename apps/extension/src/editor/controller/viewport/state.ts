import { useEditorStore } from '../../state/useEditorStore';
import type { SourceState } from '../../document/model/source-state';
import { buildEditorViewportState, getEditorStageInsets } from './metrics';

export function syncEditorViewportState(options: {
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: { width: number; height: number };
  zoomLevel: number;
  source: SourceState | null;
  devicePixelRatioBaseline?: number;
}): void {
  const store = useEditorStore.getState();
  const viewport = buildEditorViewportState(options);
  if (!store.imageData || !options.viewportElement) {
    if (!store.viewportPreviewAutomationBlockedInSession) {
      store.setViewportPreviewOpenFromSync(false);
    }

    store.updateViewport(viewport);
    return;
  }

  const stageInsets = getEditorStageInsets(
    options.stageElement,
    options.viewportElement,
    options.devicePixelRatioBaseline
  );
  const availableWidth = Math.max(0, viewport.viewportWidth - stageInsets.horizontal);
  const availableHeight = Math.max(0, viewport.viewportHeight - stageInsets.vertical);
  const hasOverflow =
    options.canvasDocumentSize.width * options.zoomLevel > availableWidth ||
    options.canvasDocumentSize.height * options.zoomLevel > availableHeight;
  if (!store.viewportPreviewAutomationBlockedInSession) {
    store.setViewportPreviewOpenFromSync(hasOverflow);
  }

  store.updateViewport(viewport);
}
