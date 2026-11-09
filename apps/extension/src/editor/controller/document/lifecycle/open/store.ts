import { useEditorStore } from '../../../../state/useEditorStore';

export function syncOpenedDocumentState(options: {
  browserFrameUrl: string;
  dataUrl: string;
  faviconDataUrl?: string | null;
  pageTitle: string;
  preserveInspector?: boolean;
}): void {
  const store = useEditorStore.getState();

  store.setShowOutsideCanvas(false);
  if (!options.preserveInspector) store.setInspector('file');
  store.setFreshImageBackgroundPending(true);
  store.setImageData(options.dataUrl);
  store.setPageTitle(options.pageTitle);
  store.setBrowserFrame({
    faviconDataUrl: options.faviconDataUrl ?? null,
    title: options.pageTitle,
    url: options.browserFrameUrl,
  });
}

export function syncLoadedDocumentState(sourceImageData: string, preserveInspector = false): void {
  const store = useEditorStore.getState();

  store.setShowOutsideCanvas(false);
  if (!preserveInspector) store.setInspector('file');
  store.setFreshImageBackgroundPending(false);
  store.setImageData(sourceImageData);
}
