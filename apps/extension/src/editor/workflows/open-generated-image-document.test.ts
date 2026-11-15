import { beforeEach, expect, it, vi } from 'vitest';
import { openGeneratedImageDocument } from './open-generated-image-document';

const calls = vi.hoisted(() => ({ persist: vi.fn(), create: vi.fn(), url: vi.fn() }));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { create: calls.create } }));
vi.mock('../../workflows/editor/bootstrap', () => ({
  persistPendingEditorBootstrapPayload: calls.persist,
}));
vi.mock('../../platform/navigation/extension-pages/editor', () => ({ buildEditorUrl: calls.url }));
const image = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  width: 2,
  height: 3,
};
beforeEach(() => {
  vi.resetAllMocks();
  calls.persist.mockResolvedValue('new-bootstrap');
  calls.url.mockReturnValue('chrome-extension://test/editor?bootstrapId=new-bootstrap');
  calls.create.mockResolvedValue({});
});
it('hands the unchanged native raster to a separate editor through the existing bootstrap', async () => {
  await openGeneratedImageDocument(image, 'Generated image');
  expect(calls.persist).toHaveBeenCalledExactlyOnceWith({
    dataUrl: image.dataUrl,
    title: 'Generated image',
    url: '',
  });
  expect(calls.url).toHaveBeenCalledExactlyOnceWith({ bootstrapId: 'new-bootstrap' });
  expect(calls.create).toHaveBeenCalledExactlyOnceWith({
    url: 'chrome-extension://test/editor?bootstrapId=new-bootstrap',
  });
});
it('does not open an empty editor after invalid data or a failed bootstrap', async () => {
  await expect(openGeneratedImageDocument({ ...image, width: 999 }, 'Invalid')).rejects.toThrow();
  expect(calls.persist).not.toHaveBeenCalled();
  calls.persist.mockRejectedValueOnce(new Error('unavailable'));
  await expect(openGeneratedImageDocument(image, 'Generated image')).rejects.toThrow('unavailable');
  expect(calls.create).not.toHaveBeenCalled();
});
it('reports tab admission failure to its caller without changing the chosen raster', async () => {
  calls.create.mockRejectedValueOnce(new Error('tab unavailable'));
  await expect(openGeneratedImageDocument(image, 'Generated image')).rejects.toThrow(
    'tab unavailable'
  );
  expect(image).toMatchObject({ width: 2, height: 3 });
});
