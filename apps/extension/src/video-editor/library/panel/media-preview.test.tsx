// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaPreviewPane } from './media-preview';

const { getRecording } = vi.hoisted(() => ({ getRecording: vi.fn() }));

vi.mock('../../../composition/persistence/recordings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings')>()),
  getRecording,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatNumber: (value: number) => String(value),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;

const recording = {
  createdAt: 1,
  duration: 12,
  filename: 'demo.webm',
  height: 720,
  id: 'recording-1',
  mimeType: 'video/webm',
  size: 1024,
  thumbnailId: 'recording:recording-1',
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
  getRecording.mockResolvedValue({ file: new Blob(['video'], { type: 'video/webm' }) });
  await act(async () => {
    root.render(
      <MediaPreviewPane
        recording={recording}
        thumbnailUrl="blob:thumbnail"
        onAddRecording={vi.fn()}
      />
    );
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
  getRecording.mockResolvedValue(undefined);
  await act(async () => {
    root.render(
      <MediaPreviewPane
        recording={recording}
        thumbnailUrl="blob:thumbnail"
        onAddRecording={vi.fn()}
      />
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'videoEditor.sidebar.mediaPreviewUnavailable'
  );
  expect(container.textContent).toContain('demo.webm');
  expect(container.querySelector('[data-ui="video-editor.library.item-action"]')).not.toBeNull();
});

it('hides the previous media immediately while the newly selected recording loads', async () => {
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');
  getRecording.mockResolvedValueOnce({ file: new Blob(['first']) });
  const render = (id: string) =>
    root.render(
      <MediaPreviewPane
        recording={{ ...recording, id }}
        thumbnailUrl={undefined}
        onAddRecording={vi.fn()}
      />
    );
  await act(async () => render('first'));
  expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:first');
  let resolve: (value: { file: Blob }) => void = () => {
    throw new Error('Missing resolver');
  };
  getRecording.mockReturnValueOnce(
    new Promise<{ file: Blob }>((done) => {
      resolve = done;
    })
  );
  await act(async () => render('second'));
  expect(container.querySelector('video')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
  await act(async () => resolve({ file: new Blob(['second']) }));
  expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:second');
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="videoEditor.sidebar.mediaPreviewZoomLabel"]'
    )?.value
  ).toBe('1');
});
