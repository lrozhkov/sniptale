import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { hasRecordingMediaAccess, resolveRecordingMediaAccess } from './media-access';

const query = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { permissions: { query } });
  query.mockResolvedValue({ state: 'prompt' });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['prompt', 'denied'])(
  'does not present unavailable saved sources as enabled: %s',
  async (state) => {
    query.mockResolvedValue({ state });
    const settings = { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: true, webcamEnabled: true };
    expect(await resolveRecordingMediaAccess(settings)).toMatchObject({
      microphoneEnabled: false,
      webcamEnabled: false,
    });
    expect(settings).toMatchObject({ microphoneEnabled: true, webcamEnabled: true });
  }
);

it('retains granted sources and treats a failed query as unavailable', async () => {
  query.mockResolvedValueOnce({ state: 'granted' }).mockRejectedValueOnce(new Error('Unavailable'));
  expect(
    await resolveRecordingMediaAccess({
      ...DEFAULT_VIDEO_SETTINGS,
      microphoneEnabled: true,
      webcamEnabled: true,
    })
  ).toMatchObject({ microphoneEnabled: true, webcamEnabled: false });
  expect(await hasRecordingMediaAccess('videoinput')).toBe(false);
});
