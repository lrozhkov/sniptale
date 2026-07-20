// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  deleteSavedRecordingTracksMock,
  downloadSavedRecordingTracksMock,
  openLatestRecordingInGalleryMock,
  openSavedRecordingInVideoEditorMock,
} = vi.hoisted(() => ({
  deleteSavedRecordingTracksMock: vi.fn(),
  downloadSavedRecordingTracksMock: vi.fn(),
  openLatestRecordingInGalleryMock: vi.fn(),
  openSavedRecordingInVideoEditorMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./actions', () => ({
  deleteSavedRecordingTracks: deleteSavedRecordingTracksMock,
  downloadSavedRecordingTracks: downloadSavedRecordingTracksMock,
  openLatestRecordingInGallery: openLatestRecordingInGalleryMock,
  openSavedRecordingInVideoEditor: openSavedRecordingInVideoEditorMock,
}));

import { VideoPostRecordPanel } from './panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPanel(onClose = vi.fn()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<VideoPostRecordPanel recordingId="recording-1" onClose={onClose} />);
  });

  return { onClose };
}

function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent === label
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  button.click();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  );
  deleteSavedRecordingTracksMock.mockResolvedValue(undefined);
  downloadSavedRecordingTracksMock.mockResolvedValue(undefined);
  openLatestRecordingInGalleryMock.mockResolvedValue(undefined);
  openSavedRecordingInVideoEditorMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('renders post-record actions as a single column and opens saved outputs', async () => {
  await renderPanel();

  expect(container?.querySelector('[data-busy="false"]')?.className).toContain('grid-cols-1');
  expect(Array.from(container?.querySelectorAll('button') ?? [])[0]?.textContent).toBe(
    'popup.video.postRecordOpenEditor'
  );

  await act(async () => {
    clickButton('popup.video.postRecordOpenEditor');
    clickButton('popup.video.postRecordOpenGallery');
    clickButton('popup.video.postRecordDownload');
  });

  expect(openSavedRecordingInVideoEditorMock).toHaveBeenCalledWith('recording-1');
  expect(openLatestRecordingInGalleryMock).toHaveBeenCalled();
  expect(downloadSavedRecordingTracksMock).toHaveBeenCalledWith('recording-1');
});

it('opens the saved recording directly in the gallery', async () => {
  await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordOpenGallery');
  });

  expect(openLatestRecordingInGalleryMock).toHaveBeenCalledWith('recording-1');
});

it('closes after deleting confirmed saved outputs', async () => {
  const { onClose } = await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(window.confirm).toHaveBeenCalledWith('popup.video.postRecordDeleteConfirm');
  expect(onClose).toHaveBeenCalled();
  expect(deleteSavedRecordingTracksMock).toHaveBeenCalledWith('recording-1');
});

it('keeps the panel open and reports an error when deletion fails', async () => {
  const { onClose } = await renderPanel();
  deleteSavedRecordingTracksMock.mockRejectedValueOnce(new Error('delete failed'));

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(onClose).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('popup.video.postRecordActionError');
});

it('does not delete when the destructive action is cancelled', async () => {
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(deleteSavedRecordingTracksMock).not.toHaveBeenCalled();
});
