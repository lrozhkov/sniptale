import { applyOpenedEditorDocument } from './apply';
import { resolveEditorOpenImageContext } from './context';
import { createOpenedEditorDocument } from './create';
import { resolveBrowserFrameFaviconDataUrl } from './favicon';
import type { OpenEditorControllerImageOptions } from './options';

let latestOpenImageRunToken = 0;

export async function openEditorControllerImage(
  options: OpenEditorControllerImageOptions
): Promise<void> {
  const runToken = ++latestOpenImageRunToken;
  const context = await resolveEditorOpenImageContext(options.openOptions);
  const document = await createOpenedEditorDocument({
    context,
    dataUrl: options.dataUrl,
    sourceName: options.sourceName,
  });
  if (runToken !== latestOpenImageRunToken) {
    return;
  }

  const faviconDataUrl = await resolveBrowserFrameFaviconDataUrl(context.sourceFaviconUrl);
  if (runToken !== latestOpenImageRunToken) {
    return;
  }

  document.browserFrame = {
    ...context.browserFrame,
    title: context.pageTitle,
    url: context.browserFrameUrl,
    faviconDataUrl,
  };

  await applyOpenedEditorDocument({
    applyDocument: options.applyDocument,
    browserFrameUrl: context.browserFrameUrl,
    dataUrl: options.dataUrl,
    document,
    faviconDataUrl,
    pageTitle: context.pageTitle,
    scheduleZoomToFit: options.scheduleZoomToFit,
  });
}
