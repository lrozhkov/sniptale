import { useEditorStore } from '../../../../state/useEditorStore';

export function syncOpenedDocumentState(options: {
  browserFrameUrl: string;
  dataUrl: string;
  faviconDataUrl?: string | null;
  pageTitle: string;
}): void {
  const store = useEditorStore.getState();

  store.setInspector('file');
  store.setImageData(options.dataUrl);
  store.setPageTitle(options.pageTitle);
  store.setBrowserFrame({
    faviconDataUrl: options.faviconDataUrl ?? null,
    title: options.pageTitle,
    url: options.browserFrameUrl,
  });
}

export function syncLoadedDocumentState(sourceImageData: string): void {
  const store = useEditorStore.getState();

  store.setInspector('file');
  store.setImageData(sourceImageData);
}
