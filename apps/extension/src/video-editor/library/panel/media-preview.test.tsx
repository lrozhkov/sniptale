// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaPreviewPane } from './media-preview';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';

const { getMediaAssetBlob, getAggregatePresentation } = vi.hoisted(() => ({
  getMediaAssetBlob: vi.fn(),
  getAggregatePresentation: vi.fn(),
}));

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  getMediaAssetBlob,
}));
vi.mock('../../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatNumber: (value: number) => String(value),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;

const recording: MediaLibraryItem = {
  kind: 'recording',
  source: { kind: 'recording', recordingId: 'recording-1' },
  updatedAt: 1,
  originalFilename: 'demo.webm',
  hasThumbnail: true,
  sourceUrl: null,
  sourceTitle: null,
  sourceFavicon: null,
  tags: [],
  createdAt: 1,
  duration: 12,
  filename: 'demo.webm',
  height: 720,
  id: 'recording-1',
  mimeType: 'video/webm',
  size: 1024,
  width: 1280,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:recording-preview'),
    revokeObjectURL: vi.fn(),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads the selected recording into a playable and zoomable preview', async () => {
  getMediaAssetBlob.mockResolvedValue(new Blob(['video'], { type: 'video/webm' }));
  await act(async () => {
    root.render(<MediaPreviewPane item={recording} onAddMedia={vi.fn()} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  const video = container.querySelector('video');
  expect(video?.getAttribute('src')).toBe('blob:recording-preview');
  expect(video?.hasAttribute('controls')).toBe(false);
  expect(container.querySelector('[aria-label="videoEditor.timeline.play"]')).not.toBeNull();
  expect(
    container
      .querySelector('[aria-label="videoEditor.sidebar.mediaPreviewZoomLabel"]')
      ?.classList.contains('sniptale-range')
  ).toBe(true);
});

it('keeps metadata and retry-safe actions available when preview media is missing', async () => {
  getMediaAssetBlob.mockResolvedValue(undefined);
  await act(async () => {
    root.render(<MediaPreviewPane item={recording} onAddMedia={vi.fn()} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'videoEditor.sidebar.mediaPreviewUnavailable'
  );
  expect(container.textContent).toContain('demo.webm');
  expect(container.querySelector<HTMLButtonElement>('footer button')?.disabled).toBe(true);
});

it('hides the previous media immediately while the newly selected recording loads', async () => {
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');
  getMediaAssetBlob.mockResolvedValueOnce(new Blob(['first']));
  const render = (id: string) =>
    root.render(<MediaPreviewPane item={{ ...recording, id }} onAddMedia={vi.fn()} />);
  await act(async () => render('first'));
  expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:first');
  let resolve: (value: Blob) => void = () => {
    throw new Error('Missing resolver');
  };
  getMediaAssetBlob.mockReturnValueOnce(
    new Promise<Blob>((done) => {
      resolve = done;
    })
  );
  await act(async () => render('second'));
  expect(container.querySelector('video')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
  await act(async () => resolve(new Blob(['second'])));
  expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:second');
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="videoEditor.sidebar.mediaPreviewZoomLabel"]'
    )?.value
  ).toBe('1');
});

it('previews the edited screenshot without video controls or original fallback', async () => {
  getAggregatePresentation.mockResolvedValue({
    presentationRevision: 2,
    previewBlob: new Blob(['edited'], { type: 'image/png' }),
  });
  await act(async () =>
    root.render(
      <MediaPreviewPane
        item={{
          ...recording,
          kind: 'screenshot',
          source: { kind: 'screenshot' },
          workspaceRevision: 2,
        }}
        onAddMedia={vi.fn()}
      />
    )
  );
  expect(getMediaAssetBlob).not.toHaveBeenCalled();
  expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recording-preview');
  expect(container.querySelector('video')).toBeNull();
  expect(container.querySelector('[aria-label="videoEditor.timeline.play"]')).toBeNull();
});

it('shows insertion failure, allows retry and reports success only after completion', async () => {
  getMediaAssetBlob.mockResolvedValue(new Blob(['video']));
  const add = vi.fn().mockRejectedValueOnce(new Error('Storage full'));
  await act(async () => root.render(<MediaPreviewPane item={recording} onAddMedia={add} />));
  const button = container.querySelector<HTMLButtonElement>('footer button')!;
  await act(async () => button.click());
  expect(container.textContent).toContain('videoEditor.app.materialsImportFailed');
  expect(button.disabled).toBe(false);
  let finish!: () => void;
  add.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => button.click());
  expect(button.disabled).toBe(true);
  expect(button.textContent).toContain('common.states.loading');
  await act(async () => finish());
  expect(button.textContent).toContain('videoEditor.sidebar.libraryAddedMaterials');
  expect(add).toHaveBeenLastCalledWith(recording.id);
});
