// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  thumbnail: vi.fn(),
  entry: vi.fn(),
  blob: vi.fn(),
  openFile: vi.fn(),
  setImageData: vi.fn(),
}));
vi.mock('../../../composition/persistence/media-library', () => ({
  listMediaLibrary: mocks.list,
  getMediaThumbnail: mocks.thumbnail,
  getMediaLibraryEntry: mocks.entry,
  getMediaAssetBlob: mocks.blob,
}));
vi.mock('../../workflows/open-local-image-draft', () => ({
  openLocalImageAsEditorDraft: mocks.openFile,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => ({ setImageData: mocks.setImageData }) },
}));
vi.mock('../../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: vi.fn(() => '/editor'),
}));
import { ImageEditorStart } from './start';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const runOpen = vi.fn(async (action: () => Promise<void>) => action());
const services = { controller: {} } as React.ComponentProps<typeof ImageEditorStart>['services'];
async function render() {
  await act(async () => root.render(<ImageEditorStart services={services} runOpen={runOpen} />));
}
function actions() {
  return [...container.querySelectorAll<HTMLButtonElement>('[data-ui="editor.start"] button')];
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.thumbnail.mockReset().mockResolvedValue(undefined);
  mocks.entry.mockReset().mockResolvedValue(undefined);
  mocks.blob.mockReset().mockResolvedValue(undefined);
  mocks.openFile.mockReset().mockResolvedValue(undefined);
  runOpen.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('creates a 1280×720 image through the existing durable draft workflow', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['png'], { type: 'image/png' }))
  );
  await render();
  await act(async () => actions()[0]?.click());
  const file = mocks.openFile.mock.calls[0]?.[1] as File;
  expect(file.name).toBe('Untitled.png');
  expect(file.type).toBe('image/png');
  expect(runOpen).toHaveBeenCalledOnce();
});

it('opens a selected image file and reports a deleted recent image without losing actions', async () => {
  mocks.list.mockResolvedValue([
    {
      id: 'image',
      kind: 'image',
      filename: 'Recent.png',
      updatedAt: 4,
      width: 1280,
      height: 720,
      lifecycle: { storageClass: 'library' },
    },
    {
      id: 'draft',
      kind: 'image',
      filename: 'Draft.png',
      updatedAt: 5,
      lifecycle: { storageClass: 'temporary' },
    },
  ]);
  await render();
  expect(container.textContent).toContain('Recent.png');
  expect(container.textContent).not.toContain('Draft.png');
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(['image'], 'chosen.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(mocks.openFile).toHaveBeenCalledWith(services.controller, file, mocks.setImageData);
  await act(async () => actions()[2]?.click());
  expect(container.textContent).toContain('shared.editorStart.openFailed');
  expect(actions()[0]?.disabled).toBe(false);
});

it('keeps Create and Open available when the list fails', async () => {
  mocks.list.mockRejectedValueOnce(new Error('storage'));
  await render();
  expect(container.textContent).toContain('shared.editorStart.error');
  expect(actions()[0]?.disabled).toBe(false);
  expect(actions()[1]?.disabled).toBe(false);
});

it('reports a blank canvas failure and keeps the Open action usable', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await render();
  await act(async () => actions()[0]?.click());
  expect(container.textContent).toContain('shared.editorStart.createFailed');
  expect(actions()[1]?.disabled).toBe(false);
});

it('reports PNG encoding failure without opening a draft', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
  await render();
  await act(async () => actions()[0]?.click());
  expect(container.textContent).toContain('shared.editorStart.createFailed');
  expect(mocks.openFile).not.toHaveBeenCalled();
});
