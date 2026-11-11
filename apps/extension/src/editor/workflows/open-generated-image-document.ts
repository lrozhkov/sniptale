import { browserTabs } from '@sniptale/platform/browser/tabs';
import { imageRasterSchema, type ImageRaster } from '../../contracts/ai/image';
import { buildEditorUrl } from '../../platform/navigation/extension-pages/editor';
import { persistPendingEditorBootstrapPayload } from '../../workflows/editor/bootstrap';

/** Transfers a native result to a separate editor without changing the current document. */
export async function openGeneratedImageDocument(image: ImageRaster, title: string): Promise<void> {
  const raster = imageRasterSchema.parse(image);
  const bootstrapId = await persistPendingEditorBootstrapPayload({
    dataUrl: raster.dataUrl,
    title,
    url: '',
  });
  await browserTabs.create({ url: buildEditorUrl({ bootstrapId }) });
}
