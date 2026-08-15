// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  deleteVideoPostRecordResultMock,
  downloadSavedRecordingTracksMock,
  openLatestRecordingInGalleryMock,
  openSavedRecordingInVideoEditorMock,
} = vi.hoisted(() => ({
  deleteVideoPostRecordResultMock: vi.fn(),
  downloadSavedRecordingTracksMock: vi.fn(),
  openLatestRecordingInGalleryMock: vi.fn(),
  openSavedRecordingInVideoEditorMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../workflows/media-hub/post-record-actions', () => ({
  deleteVideoPostRecordResult: deleteVideoPostRecordResultMock,
  downloadSavedRecordingTracks: downloadSavedRecordingTracksMock,
  openLatestRecordingInGallery: openLatestRecordingInGalleryMock,
  openSavedRecordingInVideoEditor: openSavedRecordingInVideoEditorMock,
}));

import { VideoPostRecordPanel } from './panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const RESULT = {
  primaryRecordingId: 'recording-1',
  projectId: null,
  recordingId: 'recording-1',
};

async function renderPanel(onAcknowledge = vi.fn().mockResolvedValue(undefined)) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<VideoPostRecordPanel result={RESULT} onAcknowledge={onAcknowledge} />);
  });

  return { onAcknowledge };
}

function findButton(label: string) {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent === label
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function clickButton(label: string) {
  const button = findButton(label);
  button.click();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  );
  deleteVideoPostRecordResultMock.mockResolvedValue(undefined);
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

it('renders post-record actions as a single column and runs one explicit decision', async () => {
  await renderPanel();

  expect(container?.querySelector('[data-busy="false"]')?.className).toContain('grid-cols-1');
  expect(Array.from(container?.querySelectorAll('button') ?? [])[0]?.textContent).toBe(
    'popup.video.postRecordOpenEditor'
  );

  await act(async () => {
    clickButton('popup.video.postRecordOpenEditor');
  });

  expect(openSavedRecordingInVideoEditorMock).toHaveBeenCalledWith(RESULT);
  expect(openLatestRecordingInGalleryMock).not.toHaveBeenCalled();
  expect(downloadSavedRecordingTracksMock).not.toHaveBeenCalled();
});

it('disables every action and rejects same-tick re-entry while a decision is pending', async () => {
  let finishDecision!: () => void;
  openSavedRecordingInVideoEditorMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishDecision = resolve;
    })
  );
  await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordOpenEditor');
    clickButton('popup.video.postRecordOpenEditor');
    await Promise.resolve();
  });

  expect(openSavedRecordingInVideoEditorMock).toHaveBeenCalledOnce();
  expect(
    Array.from(container?.querySelectorAll('button') ?? []).every((button) => button.disabled)
  ).toBe(true);

  await act(async () => finishDecision());
});

it('opens the saved recording directly in the gallery', async () => {
  await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordOpenGallery');
  });

  expect(openLatestRecordingInGalleryMock).toHaveBeenCalledWith('recording-1');
});

it('closes after deleting confirmed saved outputs', async () => {
  const { onAcknowledge } = await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(window.confirm).toHaveBeenCalledWith('popup.video.postRecordDeleteConfirm');
  expect(onAcknowledge).toHaveBeenCalled();
  expect(deleteVideoPostRecordResultMock).toHaveBeenCalledWith(RESULT);
});

it('keeps the panel open and reports an error when deletion fails', async () => {
  const { onAcknowledge } = await renderPanel();
  deleteVideoPostRecordResultMock.mockRejectedValueOnce(new Error('delete failed'));

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(onAcknowledge).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('popup.video.postRecordActionError');
});

it('keeps deleted-media authority visible when the acknowledgement write fails', async () => {
  const onAcknowledge = vi.fn().mockRejectedValueOnce(new Error('session write failed'));
  await renderPanel(onAcknowledge);

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(deleteVideoPostRecordResultMock).toHaveBeenCalledWith(RESULT);
  expect(onAcknowledge).toHaveBeenCalledOnce();
  expect(container?.textContent).toContain('popup.video.postRecordTitle');
  expect(container?.textContent).toContain('popup.video.postRecordActionError');
});

it('does not delete when the destructive action is cancelled', async () => {
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await renderPanel();

  await act(async () => {
    clickButton('popup.video.postRecordDelete');
  });

  expect(deleteVideoPostRecordResultMock).not.toHaveBeenCalled();
});
