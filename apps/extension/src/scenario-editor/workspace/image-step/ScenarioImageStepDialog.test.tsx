// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  getMediaAssetBlobMock,
  getMediaThumbnailMock,
  listMediaLibraryMock,
  syncLegacyMediaLibraryMock,
} = vi.hoisted(() => ({
  getMediaAssetBlobMock: vi.fn(),
  getMediaThumbnailMock: vi.fn(),
  listMediaLibraryMock: vi.fn(),
  syncLegacyMediaLibraryMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: getMediaAssetBlobMock,
    getMediaThumbnail: getMediaThumbnailMock,
    listMediaLibrary: listMediaLibraryMock,
    syncLegacyMediaLibrary: syncLegacyMediaLibraryMock,
  })
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ScenarioImageStepDialog } from './ScenarioImageStepDialog';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createImageItem() {
  return {
    id: 'image-1',
    kind: 'screenshot',
    source: { kind: 'screenshot' as const },
    filename: 'image-1.png',
    originalFilename: 'Image 1.png',
    createdAt: 1,
    updatedAt: 1,
    size: 5,
    mimeType: 'image/png',
    width: 1200,
    height: 800,
    duration: null,
    sourceUrl: 'https://example.com/page',
    sourceTitle: 'Example page',
    sourceFavicon: null,
    tags: ['guide'],
    hasThumbnail: true,
  };
}

async function renderDialog(onInsertImage = vi.fn(async () => undefined)) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioImageStepDialog onClose={vi.fn()} onInsertImage={onInsertImage} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  return { onInsertImage };
}

function dispatchDrop(target: Element | null | undefined, files: File[]) {
  const event = new Event('drop', { bubbles: true });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: { files },
  });
  target?.dispatchEvent(event);
}

function getButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function setInputValue(input: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
  input?.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:thumb-1'),
    revokeObjectURL: vi.fn(),
  });
  syncLegacyMediaLibraryMock.mockResolvedValue(undefined);
  listMediaLibraryMock.mockResolvedValue([
    createImageItem(),
    {
      ...createImageItem(),
      id: 'video-1',
      filename: 'video.mp4',
      originalFilename: 'video.mp4',
      mimeType: 'video/mp4',
    },
  ]);
  getMediaAssetBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  getMediaThumbnailMock.mockResolvedValue({
    assetId: 'image-1',
    blob: new Blob(['thumb'], { type: 'image/png' }),
    createdAt: 1,
    updatedAt: 1,
    width: 160,
    height: 100,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('loads image-only library items, filters by search, and forwards the selected blob payload', async () => {
  const { onInsertImage } = await renderDialog();
  const searchInput = container?.querySelector<HTMLInputElement>('input[type="text"]');

  expect(container?.textContent).toContain('Image 1.png');
  expect(container?.textContent).not.toContain('video.mp4');
  expect(container?.querySelector('img[src="blob:thumb-1"]')).not.toBeNull();
  expect(container?.textContent).toContain('image/png • 1200 × 800');
  expect(container?.textContent).toContain('guide');

  await act(async () => {
    setInputValue(searchInput ?? null, 'guide');
  });

  await act(async () => {
    getButton('Image 1.png')?.click();
  });

  expect(syncLegacyMediaLibraryMock).toHaveBeenCalledTimes(1);
  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('image-1');
  expect(onInsertImage).toHaveBeenCalledWith(
    expect.objectContaining({
      blob: expect.any(Blob),
      filename: 'Image 1.png',
      galleryAssetId: 'image-1',
      sourceTitle: 'Example page',
      sourceUrl: 'https://example.com/page',
    })
  );
});

it('shows the empty state when search removes all image matches', async () => {
  await renderDialog();
  const searchInput = container?.querySelector<HTMLInputElement>('input[type="text"]');

  await act(async () => {
    setInputValue(searchInput ?? null, 'missing');
  });

  expect(container?.textContent).toContain('scenario.editor.imageStepDialogEmpty');
});

it('shows an error when the selected gallery asset blob cannot be read', async () => {
  getMediaAssetBlobMock.mockResolvedValueOnce(undefined);
  const { onInsertImage } = await renderDialog();

  await act(async () => {
    getButton('Image 1.png')?.click();
  });

  expect(container?.textContent).toContain('shared.runtime.readBlobFailed');
  expect(onInsertImage).not.toHaveBeenCalled();
});

it('renders the empty library state when no images are available', async () => {
  listMediaLibraryMock.mockResolvedValueOnce([]);

  await renderDialog();

  expect(container?.textContent).toContain('scenario.editor.imageStepDialogEmpty');
});

it('forwards uploaded local files as image-step payloads', async () => {
  const { onInsertImage } = await renderDialog();
  const fileInput = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const file = new File(['image'], 'local.png', { type: 'image/png' });

  await act(async () => {
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(onInsertImage).toHaveBeenCalledWith({
    blob: file,
    filename: 'local.png',
  });
});

it('opens the hidden file picker from the dropzone shell', async () => {
  await renderDialog();
  const fileInput = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const dropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );
  const clickSpy = vi.spyOn(fileInput ?? document.createElement('input'), 'click');

  await act(async () => {
    dropzone?.click();
  });

  expect(clickSpy).toHaveBeenCalledTimes(1);
});

it('ignores empty file input and drop events without creating inserts', async () => {
  const { onInsertImage } = await renderDialog();
  const fileInput = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const dropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );

  await act(async () => {
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [],
    });
    fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    dispatchDrop(dropzone, []);
  });

  expect(onInsertImage).not.toHaveBeenCalled();
});

it('skips thumbnail object URLs when thumbnail records are missing', async () => {
  listMediaLibraryMock.mockResolvedValueOnce([
    createImageItem(),
    {
      ...createImageItem(),
      id: 'image-2',
      filename: 'image-2.png',
      originalFilename: 'Image 2.png',
      hasThumbnail: false,
    },
  ]);
  getMediaThumbnailMock.mockResolvedValueOnce(undefined);

  await renderDialog();

  expect(container?.textContent).toContain('Image 2.png');
  expect(vi.mocked(URL.createObjectURL)).not.toHaveBeenCalled();
});

it('surfaces insert errors returned from the dialog action', async () => {
  const onInsertImage = vi.fn(async () => Promise.reject(new Error('Upload failed')));
  await renderDialog(onInsertImage);
  const fileInput = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const file = new File(['image'], 'local.png', { type: 'image/png' });

  await act(async () => {
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(onInsertImage).toHaveBeenCalledWith({
    blob: file,
    filename: 'local.png',
  });
  expect(container?.textContent).toContain('Upload failed');
});
