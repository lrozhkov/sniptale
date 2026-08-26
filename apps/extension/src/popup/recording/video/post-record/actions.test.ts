// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deletePersistedVideoProject: vi.fn(),
  deleteRecording: vi.fn(),
  getRecording: vi.fn(),
  listRecordings: vi.fn(),
  openGalleryPage: vi.fn(),
  openVideoEditorPage: vi.fn(),
}));

vi.mock('../../../../workflows/media-hub/video-projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/media-hub/video-projects')>()),
  deletePersistedVideoProject: mocks.deletePersistedVideoProject,
}));

vi.mock('../../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/recordings/index')
  >()),
  deleteRecording: mocks.deleteRecording,
  getRecording: mocks.getRecording,
  listRecordings: mocks.listRecordings,
}));

vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.openGalleryPage,
  openVideoEditorPage: mocks.openVideoEditorPage,
}));

import {
  deleteVideoPostRecordResult,
  downloadSavedRecordingTracks,
  openLatestRecordingInGallery,
  openSavedRecordingInVideoEditor,
} from '../../../../workflows/media-hub/post-record-actions';

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
  mocks.deletePersistedVideoProject.mockReset();
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

it('opens the primary recording in the internal gallery', async () => {
  const close = vi.fn();
  vi.stubGlobal('close', close);

  await openLatestRecordingInGallery('rec-1');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ recordingId: 'rec-1' });
  expect(close).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('opens a draft recording without narrowing the visible gallery scope', async () => {
  mocks.getRecording.mockResolvedValueOnce({
    ...createRecording('rec-1'),
    blob: new Blob(['rec-1'], { type: 'video/webm' }),
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
  });

  await openLatestRecordingInGallery('rec-1');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ recordingId: 'rec-1' });
});

it('opens a single recording or grouped project in the internal video editor', async () => {
  const close = vi.fn();
  vi.stubGlobal('close', close);

  await openSavedRecordingInVideoEditor({
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  });

  expect(mocks.openVideoEditorPage).toHaveBeenCalledWith(null, 'rec-1');
  await openSavedRecordingInVideoEditor({
    primaryRecordingId: 'rec-2-window-1',
    projectId: 'project-2',
    recordingId: 'rec-2',
  });
  expect(mocks.openVideoEditorPage).toHaveBeenLastCalledWith('project-2', null);
  expect(close).not.toHaveBeenCalled();
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

it('deletes a grouped project before removing every saved raw track', async () => {
  await deleteVideoPostRecordResult({
    primaryRecordingId: 'rec-1',
    projectId: 'project-1',
    recordingId: 'rec-1',
  });

  expect(mocks.deletePersistedVideoProject).toHaveBeenCalledWith('project-1');
  expect(mocks.deleteRecording).toHaveBeenCalledTimes(3);
  expect(mocks.deleteRecording).toHaveBeenCalledWith('rec-1');
  expect(mocks.deleteRecording).toHaveBeenCalledWith('rec-1-webcam');
  expect(mocks.deleteRecording).toHaveBeenCalledWith('rec-1-window-1');
  expect(mocks.deleteRecording).not.toHaveBeenCalledWith('other');
  expect(mocks.deletePersistedVideoProject.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.deleteRecording.mock.invocationCallOrder[0] ?? 0
  );
});

it('deletes single-source raw tracks without invoking project deletion', async () => {
  await deleteVideoPostRecordResult({
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  });

  expect(mocks.deletePersistedVideoProject).not.toHaveBeenCalled();
  expect(mocks.deleteRecording).toHaveBeenCalledTimes(3);
});
