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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
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
  expect(container.querySelector('[aria-label="gallery.preview.player.play"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="gallery.preview.player.scale"]')).not.toBeNull();
  expect(
    container.querySelector('[aria-label="gallery.preview.player.fullscreen"]')
  ).not.toBeNull();
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
  expect(container.querySelector('[aria-label="gallery.preview.player.play"]')).not.toBeNull();
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
  expect(container.querySelector('[aria-label="gallery.preview.player.play"]')).toBeNull();
  expect(container.querySelector('[aria-label="gallery.preview.zoomIn"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="gallery.preview.zoomSlider"]')).not.toBeNull();
  const zoomPanel = container.querySelector<HTMLElement>(
    '[data-ui="gallery.preview.zoomSliderPanel"]'
  );
  expect(zoomPanel?.className).toContain('top-full');
  expect(zoomPanel?.className).toContain('inset-x-0');
  expect(
    container.querySelector('[aria-label="videoEditor.stage.enterFullscreen"]')
  ).not.toBeNull();
});

it('enters and exits fullscreen for a ready image while retaining insert controls', async () => {
  getMediaAssetBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  await act(async () =>
    root.render(
      <MediaPreviewPane
        item={{ ...recording, kind: 'image', mimeType: 'image/png' }}
        onAddMedia={vi.fn()}
      />
    )
  );
  const image = container.querySelector('img')!;
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 1280 },
    naturalHeight: { configurable: true, value: 720 },
  });
  await act(async () => image.dispatchEvent(new Event('load')));
  const frame = container.querySelector<HTMLElement>(
    '[data-ui="video-editor.library.image-preview"]'
  )!;
  let activeFullscreen: Element | null = null;
  const requestFullscreen = vi.fn(async () => {
    activeFullscreen = frame;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  const exitFullscreen = vi.fn(async () => {
    activeFullscreen = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => activeFullscreen,
  });
  Object.defineProperty(frame, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  try {
    const enter = container.querySelector<HTMLButtonElement>(
      '[aria-label="videoEditor.stage.enterFullscreen"]'
    )!;
    expect(enter.disabled).toBe(false);
    await act(async () => enter.click());
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(container.querySelector('footer button')).not.toBeNull();
    const exit = container.querySelector<HTMLButtonElement>(
      '[aria-label="videoEditor.stage.exitFullscreen"]'
    )!;
    await act(async () => exit.click());
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(enter);
  } finally {
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
  }
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

it('previews an original stored image also used by a scenario without requiring a derived presentation', async () => {
  getAggregatePresentation.mockResolvedValue(undefined);
  getMediaAssetBlob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
  await act(async () =>
    root.render(
      <MediaPreviewPane
        item={{
          ...recording,
          kind: 'image',
          mimeType: 'image/png',
          workspaceRevision: 0,
          imageContentState: 'original',
          source: { kind: 'stored-asset', assetId: 'shared-with-scenario' },
        }}
        onAddMedia={vi.fn()}
      />
    )
  );
  expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recording-preview');
  expect(container.querySelector('video')).toBeNull();
});

it('identifies a missing current edited image preview without falling back to source bytes', async () => {
  getAggregatePresentation.mockResolvedValue({
    presentationRevision: 1,
    previewBlob: new Blob(['old']),
  });
  await act(async () =>
    root.render(
      <MediaPreviewPane
        item={{
          ...recording,
          kind: 'image',
          mimeType: 'image/png',
          workspaceRevision: 2,
          imageContentState: 'edited',
        }}
        onAddMedia={vi.fn()}
      />
    )
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'mediaPreviewImageNotReady'
  );
  expect(getMediaAssetBlob).not.toHaveBeenCalled();
});

it('distinguishes storage read failure from missing media', async () => {
  getMediaAssetBlob.mockRejectedValue(new Error('Storage unavailable'));
  await act(async () => root.render(<MediaPreviewPane item={recording} onAddMedia={vi.fn()} />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'mediaPreviewReadFailed'
  );
});

it('uses an audio player and reports audio decoding failure', async () => {
  getMediaAssetBlob.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
  await act(async () =>
    root.render(
      <MediaPreviewPane
        item={{
          ...recording,
          kind: 'audio',
          mimeType: 'audio/mpeg',
          filename: 'Voice.mp3',
        }}
        onAddMedia={vi.fn()}
      />
    )
  );
  expect(container.querySelector('video')).toBeNull();
  const audio = container.querySelector('audio');
  expect(audio?.getAttribute('src')).toBe('blob:recording-preview');
  await act(async () => audio?.dispatchEvent(new Event('error')));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'mediaPreviewAudioDecodeFailed'
  );
});
