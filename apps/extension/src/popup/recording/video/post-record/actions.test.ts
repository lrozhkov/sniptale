// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteRecording: vi.fn(),
  getRecording: vi.fn(),
  listRecordings: vi.fn(),
  openGalleryPage: vi.fn(),
  openVideoEditorPage: vi.fn(),
}));

vi.mock('../../../../composition/persistence/recordings/index', () => ({
  cleanupOldRecordings: vi.fn(),
  deleteRecording: mocks.deleteRecording,
  getRecording: mocks.getRecording,
  listRecordings: mocks.listRecordings,
  saveRecording: vi.fn(),
}));

vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.openGalleryPage,
  openVideoEditorPage: mocks.openVideoEditorPage,
}));

import {
  deleteSavedRecordingTracks,
  downloadSavedRecordingTracks,
  openLatestRecordingInGallery,
  openSavedRecordingInVideoEditor,
} from './actions';

const urlMocks = {
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
};
let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

function createRecording(id: string, filename = `${id}.webm`) {
  return {
    id,
    filename,
    createdAt: 1,
    duration: null,
    height: null,
    mimeType: 'video/webm',
    size: 12,
    thumbnailId: `recording:${id}`,
    width: null,
  };
}

beforeEach(() => {
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: urlMocks.createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: urlMocks.revokeObjectURL,
  });
  urlMocks.createObjectURL.mockReset();
  urlMocks.revokeObjectURL.mockReset();
  urlMocks.createObjectURL.mockReturnValue('blob:recording');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(vi.fn());
  vi.useFakeTimers();
  mocks.deleteRecording.mockReset();
  mocks.getRecording.mockReset();
  mocks.listRecordings.mockReset();
  mocks.openGalleryPage.mockReset();
  mocks.openVideoEditorPage.mockReset();
  mocks.listRecordings.mockResolvedValue([
    createRecording('other'),
    createRecording('rec-1-webcam'),
    createRecording('rec-1'),
    createRecording('rec-1-window-1'),
  ]);
  mocks.getRecording.mockImplementation((id: string) =>
    Promise.resolve({
      id,
      blob: new Blob([id], { type: 'video/webm' }),
      filename: `${id}.webm`,
      createdAt: 1,
      size: 12,
    })
  );
});

afterEach(() => {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }

  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('opens the internal gallery and closes the popup', async () => {
  const close = vi.fn();
  vi.stubGlobal('close', close);

  await openLatestRecordingInGallery('rec-1');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ recordingId: 'rec-1' });
  expect(close).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it('opens the completed recording in the internal video editor and closes the popup', async () => {
  const close = vi.fn();
  vi.stubGlobal('close', close);

  await openSavedRecordingInVideoEditor('rec-1');

  expect(mocks.openVideoEditorPage).toHaveBeenCalledWith(null, 'rec-1');
  expect(close).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it('downloads every saved track from popup-owned Blob URLs', async () => {
  await downloadSavedRecordingTracks('rec-1');
  await vi.runOnlyPendingTimersAsync();

  expect(mocks.getRecording).toHaveBeenCalledTimes(3);
  expect(mocks.getRecording).toHaveBeenNthCalledWith(1, 'rec-1');
  expect(mocks.getRecording).toHaveBeenCalledWith('rec-1-webcam');
  expect(mocks.getRecording).toHaveBeenCalledWith('rec-1-window-1');
  expect(urlMocks.createObjectURL).toHaveBeenCalledTimes(3);
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(3);
  expect(urlMocks.revokeObjectURL).toHaveBeenCalledTimes(3);
});

it('reports missing saved tracks instead of invoking a privileged runtime download', async () => {
  mocks.getRecording.mockResolvedValueOnce(undefined);

  await expect(downloadSavedRecordingTracks('rec-1')).rejects.toThrow(
    'Recording rec-1 is not available for download'
  );
});

it('deletes every saved track for the completed recording id', async () => {
  await deleteSavedRecordingTracks('rec-1');

  expect(mocks.deleteRecording).toHaveBeenCalledTimes(3);
  expect(mocks.deleteRecording).toHaveBeenCalledWith('rec-1');
  expect(mocks.deleteRecording).toHaveBeenCalledWith('rec-1-webcam');
  expect(mocks.deleteRecording).toHaveBeenCalledWith('rec-1-window-1');
  expect(mocks.deleteRecording).not.toHaveBeenCalledWith('other');
});
