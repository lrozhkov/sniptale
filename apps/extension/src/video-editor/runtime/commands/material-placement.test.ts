import { expect, it, vi, afterEach } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { placeMaterialWithTelemetry } from './material-placement';

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

it('allows a genuinely absent sidecar but rejects one from another recording', async () => {
  const project = createProject([createVideoClip()]);
  const place = vi.fn(() => ({ status: 'placed' as const, clipId: 'new' }));
  const args = {
    assetId: 'asset-video',
    getProject: () => project,
    getCurrentTime: () => 0,
    place,
  };
  vi.mocked(getRecordingTelemetry).mockResolvedValue(undefined);
  expect((await placeMaterialWithTelemetry(args)).status).toBe('placed');
  place.mockClear();
  vi.mocked(getRecordingTelemetry).mockResolvedValue({
    recordingId: 'foreign',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  });
  expect((await placeMaterialWithTelemetry(args)).status).toBe('rejected');
  expect(place).not.toHaveBeenCalled();
});

it('reads the correct sidecar before committing the material', async () => {
  const project = createProject([createVideoClip()]);
  const telemetry = {
    recordingId: 'rec-asset-video',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
  vi.mocked(getRecordingTelemetry).mockResolvedValue(telemetry);
  const place = vi.fn(() => ({ status: 'placed' as const, clipId: 'new' }));
  await placeMaterialWithTelemetry({
    assetId: 'asset-video',
    getProject: () => project,
    getCurrentTime: () => 0,
    place,
  });
  expect(getRecordingTelemetry).toHaveBeenCalledWith('rec-asset-video');
  expect(place).toHaveBeenCalledWith('asset-video', undefined, telemetry);
});

it.each(['cancel', 'replace', 'seek', 'failure'] as const)(
  'does not commit after %s while reading',
  async (reason) => {
    let project = createProject([createVideoClip()]);
    let time = 0;
    const request = new AbortController();
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    vi.mocked(getRecordingTelemetry).mockReturnValue(
      new Promise((done, fail) => {
        resolve = () => done(undefined);
        reject = fail;
      })
    );
    const place = vi.fn(() => ({ status: 'placed' as const, clipId: 'new' }));
    const pending = placeMaterialWithTelemetry({
      assetId: 'asset-video',
      getProject: () => project,
      getCurrentTime: () => time,
      place,
      signal: request.signal,
    });
    if (reason === 'cancel') request.abort();
    if (reason === 'replace') project = { ...project, id: 'other' };
    if (reason === 'seek') time = 1;
    if (reason === 'failure') {
      const expectation = expect(pending).rejects.toThrow('unavailable');
      reject(new Error('unavailable'));
      await expectation;
    } else {
      resolve();
      expect((await pending).status).toBe('rejected');
    }
    expect(place).not.toHaveBeenCalled();
  }
);
