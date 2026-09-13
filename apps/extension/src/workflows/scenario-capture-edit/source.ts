import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import type { EditorBootstrapPayload } from '../../features/editor/contracts/bootstrap';
import { getScenarioAsset } from '../../composition/persistence/scenario/projects';
import { getScenarioStepEditorDocumentForTransfer } from '../../composition/persistence/scenario/editor-documents';
import { blobToDataUrl } from '../../platform/media-utils/data-url';

/** Local identity binding for one opened image editor; the child cannot choose its target. */
export interface GuideImageEditTarget {
  projectId: string;
  itemId: string;
  blockId: string;
  assetId: string;
  editDocumentId: string | null;
}
/** Loads independently owned guide bytes and editable annotations for a disposable editor session. */
export async function prepareScenarioImageEditorPayload(
  project: GuideProject,
  itemId: string,
  blockId: string
): Promise<{
  target: GuideImageEditTarget;
  payload: EditorBootstrapPayload;
}> {
  const parsed = parseGuideProject(project);
  if (parsed.status !== 'ok') throw new Error('Invalid guide.');
  const item = parsed.project.items.find((entry) => entry.id === itemId);
  const block = item?.kind === 'step' ? item.blocks.find((entry) => entry.id === blockId) : null;
  if (block?.kind !== 'image') throw new Error('The guide image is unavailable.');
  const { dataUrl, document } = await loadScenarioImageEditorSource(project.id, block);
  return {
    target: {
      projectId: project.id,
      itemId,
      blockId,
      assetId: block.assetId,
      editDocumentId: block.editDocumentId,
    },
    payload: {
      dataUrl,
      title: (block.caption || block.alt).slice(0, 160),
      ...(document ? { document: document.document } : {}),
    },
  };
}

/** Shared byte/document ownership admission for guide and tour image editor sessions. */
export async function loadScenarioImageEditorSource(
  projectId: string,
  image: { assetId: string; editDocumentId: string | null }
) {
  const asset = await getScenarioAsset(image.assetId);
  if (!asset || asset.projectId !== projectId) throw new Error('The image is unavailable.');
  const document = image.editDocumentId
    ? await getScenarioStepEditorDocumentForTransfer(image.editDocumentId)
    : undefined;
  if (image.editDocumentId && (!document || document.projectId !== projectId))
    throw new Error('The annotation document is unavailable.');
  const dataUrl = await asEditorRaster(
    asset.file.type ? asset.file : asset.file.slice(0, asset.file.size, asset.mimeType)
  );
  return { dataUrl, document, width: asset.width, height: asset.height };
}

async function asEditorRaster(blob: Blob): Promise<string> {
  let dataUrl = await blobToDataUrl(blob);
  if (isImageDataUrl(dataUrl)) return dataUrl;
  if (blob.type !== 'image/gif' && blob.type !== 'image/avif')
    throw new Error('The image exceeds editor limits.');
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 100_000_000 || Math.max(bitmap.width, bitmap.height) > 32768)
      throw new Error('The image exceeds editor limits.');
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable.');
    context.drawImage(bitmap, 0, 0);
    dataUrl = await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
    if (!isImageDataUrl(dataUrl)) throw new Error('The image exceeds editor limits.');
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
