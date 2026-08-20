import { beforeEach, expect, it, vi } from 'vitest';

const { deleteRecordingMock, getRecordingMock, listRecordingsMock } = vi.hoisted(() => ({
  deleteRecordingMock: vi.fn(),
  getRecordingMock: vi.fn(),
  listRecordingsMock: vi.fn(),
}));

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  deleteRecording: deleteRecordingMock,
  getRecording: getRecordingMock,
  listRecordings: listRecordingsMock,
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
      file: new File([id], `${id}.mp4`, { type: 'video/webm' }),
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

it('orders sibling tracks and falls back to catalog filenames', async () => {
  listRecordingsMock.mockResolvedValue([
    createRecording('rec-1-b'),
    createRecording('rec-1'),
    createRecording('rec-1-a'),
  ]);
  getRecordingMock.mockImplementation((id: string) =>
    Promise.resolve({
      file: new File([id], `${id}.webm`, { type: 'video/webm' }),
      filename: id === 'rec-1-a' ? '' : `${id}.mp4`,
      id,
    })
  );

  const tracks = await loadSavedRecordingTrackBlobs('rec-1');

  expect(tracks.map((track) => track.id)).toEqual(['rec-1', 'rec-1-a', 'rec-1-b']);
  expect(tracks[1]?.filename).toBe('rec-1-a.webm');
});

it('deletes only tracks that belong to the completed recording id', async () => {
  await deleteSavedRecordingTracks('rec-1');

  expect(deleteRecordingMock).toHaveBeenCalledWith('rec-1');
  expect(deleteRecordingMock).toHaveBeenCalledWith('rec-1-webcam');
  expect(deleteRecordingMock).not.toHaveBeenCalledWith('other');
});

it('omits a track whose durable recording cannot be hydrated', async () => {
  getRecordingMock.mockResolvedValue(undefined);

  await expect(loadSavedRecordingTrackBlobs('rec-1')).rejects.toThrow(
    'Recording rec-1 is not available'
  );
});

it('handles a recording with no related saved tracks', async () => {
  await expect(loadSavedRecordingTrackBlobs('missing')).resolves.toEqual([]);
  await deleteSavedRecordingTracks('missing');

  expect(getRecordingMock).not.toHaveBeenCalled();
  expect(deleteRecordingMock).not.toHaveBeenCalled();
});
