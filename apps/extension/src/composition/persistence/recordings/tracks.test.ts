import { beforeEach, expect, it, vi } from 'vitest';

const { deleteRecordingMock, getRecordingMock, listRecordingsMock } = vi.hoisted(() => ({
  deleteRecordingMock: vi.fn(),
  getRecordingMock: vi.fn(),
  listRecordingsMock: vi.fn(),
}));

vi.mock('./index', () => ({
  cleanupOldRecordings: vi.fn(),
  deleteRecording: deleteRecordingMock,
  getRecording: getRecordingMock,
  listRecordings: listRecordingsMock,
  saveRecording: vi.fn(),
}));

import { deleteSavedRecordingTracks, loadSavedRecordingTrackBlobs } from './tracks';

function createRecording(id: string) {
  return {
    createdAt: 1,
    duration: null,
    filename: `${id}.webm`,
    height: null,
    id,
    mimeType: 'video/webm',
    size: 12,
    thumbnailId: `recording:${id}`,
    width: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listRecordingsMock.mockResolvedValue([
    createRecording('other'),
    createRecording('rec-1-webcam'),
    createRecording('rec-1'),
  ]);
  getRecordingMock.mockImplementation((id: string) =>
    Promise.resolve({
      blob: new Blob([id], { type: 'video/webm' }),
      createdAt: 1,
      filename: `${id}.mp4`,
      id,
      size: 12,
    })
  );
});

it('loads saved recording track blobs in base-track order', async () => {
  await expect(loadSavedRecordingTrackBlobs('rec-1')).resolves.toEqual([
    expect.objectContaining({ filename: 'rec-1.mp4', id: 'rec-1' }),
    expect.objectContaining({ filename: 'rec-1-webcam.mp4', id: 'rec-1-webcam' }),
  ]);
});

it('deletes only tracks that belong to the completed recording id', async () => {
  await deleteSavedRecordingTracks('rec-1');

  expect(deleteRecordingMock).toHaveBeenCalledWith('rec-1');
  expect(deleteRecordingMock).toHaveBeenCalledWith('rec-1-webcam');
  expect(deleteRecordingMock).not.toHaveBeenCalledWith('other');
});
