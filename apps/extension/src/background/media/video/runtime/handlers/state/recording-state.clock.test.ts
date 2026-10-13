import { beforeEach, expect, it, vi } from 'vitest';
import { handleRecordingClockTiming } from './recording-state-response';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
const mocks = vi.hoisted(() => ({
  clock: vi.fn(),
  tab: vi.fn(),
  binding: vi.fn(),
  send: vi.fn(),
  lease: vi.fn(),
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getRecordingFrameClock: mocks.clock,
  getVideoRecordingTabId: mocks.tab,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  requireActiveVideoRecordingSourceBinding: mocks.binding,
  getActiveVideoRecordingLeaseSnapshot: mocks.lease,
}));
vi.mock('../../../../../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.send }),
}));
vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: object) => ({
    ...message,
    capabilityToken: 'synthetic-capability',
  }),
}));
const binding = { recordingId: 'r', generation: 1, streamInstanceId: 's' };
const sender: chrome.runtime.MessageSender = {
  id: 'extension',
  frameId: 0,
  documentId: 'source-document',
  documentLifecycle: 'active',
  tab: {
    id: 17,
    index: 0,
    windowId: 1,
    active: true,
    highlighted: true,
    pinned: false,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    frozen: false,
    lastAccessed: 0,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', { runtime: { id: 'extension' } });
  mocks.clock.mockReturnValue({
    ...binding,
    phase: 'active',
    revision: 1,
    captureEpochMs: 1000,
    mediaTimeSeconds: 0,
  });
  mocks.tab.mockReturnValue(17);
  mocks.binding.mockResolvedValue(binding);
  mocks.lease.mockReturnValue(null);
  mocks.send.mockResolvedValue({
    success: true,
    clockTiming: { ...binding, receivedAtMs: 100, repliedAtMs: 101, maximumUncertaintyMs: 8 },
  });
});
it('admits read-only timing after the native anchor while activation persistence is still pending', async () => {
  mocks.binding.mockRejectedValue(new Error('Prepared lease is not active'));
  mocks.lease.mockReturnValue({
    phase: 'prepared',
    recordingId: binding.recordingId,
    recordingTabId: 17,
    surfaceBinding: { generation: binding.generation, streamInstanceId: binding.streamInstanceId },
  });
  const reply = vi.fn();
  handleRecordingClockTiming(binding, reply, sender);
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, clockTiming: expect.objectContaining(binding) })
    )
  );
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.binding).not.toHaveBeenCalled();
});
it.each([
  { generation: 2, streamInstanceId: 's' },
  { generation: 1, streamInstanceId: 'foreign' },
])('refuses an unrelated prepared surface %o', async (surfaceBinding) => {
  mocks.binding.mockRejectedValue(new Error('Not active'));
  mocks.lease.mockReturnValue({
    phase: 'prepared',
    recordingId: binding.recordingId,
    recordingTabId: 17,
    surfaceBinding,
  });
  const reply = vi.fn();
  handleRecordingClockTiming(binding, reply, sender);
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith({
      success: false,
      error: 'RECORDING_CLOCK_BINDING_UNAVAILABLE',
    })
  );
  expect(mocks.send).not.toHaveBeenCalled();
});
it('forwards current source clock queries through protected offscreen transport', async () => {
  const reply = vi.fn();
  handleRecordingClockTiming(binding, reply, sender);
  await vi.waitFor(() => expect(reply).toHaveBeenCalled());
  expect(mocks.send).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_GET_RECORDING_CLOCK_TIMING,
    ...binding,
    capabilityToken: 'synthetic-capability',
  });
  expect(reply.mock.calls[0]![0].clockTiming).toMatchObject(binding);
  expect(reply.mock.calls[0]![0]).not.toHaveProperty('controlToken');
});
it.each([
  { frameId: 1 },
  { documentId: '' },
  { documentLifecycle: 'cached' as const },
  { id: 'other-extension' },
  { tab: { ...sender.tab!, id: 18 } },
])('does not contact offscreen for a stale or foreign source document %o', async (patch) => {
  const reply = vi.fn();
  handleRecordingClockTiming(binding, reply, { ...sender, ...patch });
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith({
      success: false,
      error: 'RECORDING_CLOCK_SOURCE_UNAVAILABLE',
    })
  );
  expect(mocks.send).not.toHaveBeenCalled();
});
it('refuses a stale generation and a binding superseded during source admission', async () => {
  const reply = vi.fn();
  handleRecordingClockTiming({ ...binding, generation: 2 }, reply, sender);
  await vi.waitFor(() => expect(reply).toHaveBeenCalled());
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.binding.mockResolvedValue({ ...binding, generation: 2 });
  reply.mockClear();
  handleRecordingClockTiming(binding, reply, sender);
  await vi.waitFor(() => expect(reply).toHaveBeenCalled());
  expect(mocks.send).not.toHaveBeenCalled();
});
