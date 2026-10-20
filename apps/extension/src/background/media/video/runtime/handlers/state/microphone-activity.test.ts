import { beforeEach, expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { handleRecordingDurationUpdated } from './recording-state';

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  canPublish: vi.fn(),
  isCurrent: vi.fn(),
  state: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('../../recording-completion', () => ({
  isCurrentRecordingLifecycleEvent: mocks.admit,
  canPublishLiveRecordingState: mocks.canPublish,
  completeVideoRecording: vi.fn(),
  failRecordingStartAfterTimeout: vi.fn(),
  ensureActiveVideoRecordingLeaseHydrated: vi.fn(),
  getRecordingCompletionState: vi.fn(),
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  isCurrentVideoRecordingId: mocks.isCurrent,
}));

vi.mock('../../session-state/service/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state/service/runtime-state-service')>()),
  getVideoRecordingRuntimeState: mocks.state,
  setVideoRecordingRuntimeState: mocks.publish,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admit.mockResolvedValue(true);
  mocks.canPublish.mockReturnValue(true);
  mocks.isCurrent.mockImplementation((recordingId: string) => recordingId === 'rec-1');
  mocks.state.mockReturnValue({
    duration: 12,
    status: VideoRecordingStatus.RECORDING,
    liveMedia: { microphoneEnabled: true },
  });
});

async function flush() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

it('publishes microphone activity without changing elapsed recording duration', async () => {
  const reply = vi.fn();
  const microphoneActivity = { status: 'ready' as const, level: 0.4, warning: false };
  handleRecordingDurationUpdated({ recordingId: 'rec-1', microphoneActivity }, reply);
  await flush();
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ microphoneActivity });
  expect(reply).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('ignores microphone activity from an earlier recording identity', async () => {
  handleRecordingDurationUpdated(
    { recordingId: 'rec-old', microphoneActivity: { status: 'ready', level: 0, warning: true } },
    vi.fn()
  );
  await flush();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it.each([
  VideoRecordingStatus.PREPARING,
  VideoRecordingStatus.COUNTDOWN,
  VideoRecordingStatus.PAUSED,
])('suppresses microphone warnings during %s while preserving device level', async (status) => {
  mocks.state.mockReturnValue({ status, duration: 12 });
  handleRecordingDurationUpdated(
    { recordingId: 'rec-1', microphoneActivity: { status: 'ready', level: 0.2, warning: true } },
    vi.fn()
  );
  await flush();
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({
    microphoneActivity: { status: 'ready', level: 0.2, warning: false },
  });
});

it('suppresses a delayed microphone warning after intentional mute', async () => {
  mocks.state.mockReturnValue({
    status: VideoRecordingStatus.RECORDING,
    duration: 12,
    liveMedia: { microphoneEnabled: false },
  });
  handleRecordingDurationUpdated(
    { recordingId: 'rec-1', microphoneActivity: { status: 'ready', level: 0.1, warning: true } },
    vi.fn()
  );
  await flush();
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({
    microphoneActivity: { status: 'disabled', level: 0, warning: false },
  });
});

it('does not publish delayed microphone activity after Stop owns the recording', async () => {
  mocks.canPublish.mockReturnValue(false);
  handleRecordingDurationUpdated(
    { recordingId: 'rec-1', microphoneActivity: { status: 'ready', level: 0.1, warning: true } },
    vi.fn()
  );
  await flush();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('does not publish microphone progress refused by lifecycle admission', async () => {
  mocks.admit.mockResolvedValue(false);
  handleRecordingDurationUpdated(
    { recordingId: 'rec-1', microphoneActivity: { status: 'ready', level: 0.1, warning: true } },
    vi.fn()
  );
  await flush();
  expect(mocks.publish).not.toHaveBeenCalled();
});
