import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
const io = vi.hoisted(() => ({ asset: vi.fn(), document: vi.fn(), data: vi.fn() }));
vi.mock('../../composition/persistence/scenario/projects', () => ({ getScenarioAsset: io.asset }));
vi.mock('../../composition/persistence/scenario/editor-documents', () => ({
  getScenarioStepEditorDocumentForTransfer: io.document,
}));
vi.mock('../../platform/media-utils/data-url', () => ({ blobToDataUrl: io.data }));
import { prepareScenarioImageEditorPayload } from './source';
function fixture(documentId: string | null = null) {
  const project = createGuideProject('Guide', 'guide', 100);
  const step = createGuideStep('Step', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 320,
      height: 180,
      editDocumentId: documentId,
      source: { kind: 'import', filename: 'image.png' },
    })
  );
  project.items.push(step);
  return project;
}
beforeEach(() => {
  vi.clearAllMocks();
  io.asset.mockResolvedValue({
    projectId: 'guide',
    file: new Blob(['image'], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  io.data.mockResolvedValue('data:image/png;base64,abc');
});
afterEach(() => vi.unstubAllGlobals());
it('binds the selected image and transfers its independently owned annotation document', async () => {
  const document = { version: 2, sourceImageData: 'data:image/png;base64,abc' };
  io.document.mockResolvedValue({ projectId: 'guide', document });
  const project = fixture('annotations');
  const before = structuredClone(project);
  const result = await prepareScenarioImageEditorPayload(project, 'step', 'image');
  expect(result.target).toEqual({
    projectId: 'guide',
    itemId: 'step',
    blockId: 'image',
    assetId: 'asset',
    editDocumentId: 'annotations',
  });
  expect(result.payload.document).toBe(document);
  expect(project).toEqual(before);
});
it('rejects missing targets and foreign assets or documents before exposing bytes', async () => {
  await expect(prepareScenarioImageEditorPayload(fixture(), 'missing', 'image')).rejects.toThrow();
  expect(io.asset).not.toHaveBeenCalled();
  io.asset.mockResolvedValueOnce({ projectId: 'foreign' });
  await expect(prepareScenarioImageEditorPayload(fixture(), 'step', 'image')).rejects.toThrow();
  io.document.mockResolvedValueOnce({ projectId: 'foreign' });
  await expect(
    prepareScenarioImageEditorPayload(fixture('annotations'), 'step', 'image')
  ).rejects.toThrow();
  io.document.mockResolvedValueOnce(undefined);
  await expect(
    prepareScenarioImageEditorPayload(fixture('annotations'), 'step', 'image')
  ).rejects.toThrow();
  expect(io.data).not.toHaveBeenCalled();
});
it('converts local GIF frames to the bounded editor raster contract and releases decoding resources', async () => {
  io.asset.mockResolvedValue({
    projectId: 'guide',
    file: new Blob(['gif'], { type: 'image/gif' }),
  });
  io.data.mockResolvedValueOnce('data:image/gif;base64,abc');
  const close = vi.fn();
  const drawImage = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 20, height: 10, close }));
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return { drawImage };
      }
      convertToBlob() {
        return Promise.resolve(new Blob(['png'], { type: 'image/png' }));
      }
    }
  );
  expect(
    (await prepareScenarioImageEditorPayload(fixture(), 'step', 'image')).payload.dataUrl
  ).toBe('data:image/png;base64,abc');
  expect(drawImage).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it('rejects oversized conversions and unsupported raster values without publishing', async () => {
  io.data.mockResolvedValue('invalid');
  await expect(prepareScenarioImageEditorPayload(fixture(), 'step', 'image')).rejects.toThrow(
    'limits'
  );
  io.asset.mockResolvedValue({
    projectId: 'guide',
    file: new Blob(['gif'], { type: 'image/gif' }),
  });
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 32769, height: 1, close }));
  await expect(prepareScenarioImageEditorPayload(fixture(), 'step', 'image')).rejects.toThrow(
    'limits'
  );
  expect(close).toHaveBeenCalledOnce();
});
