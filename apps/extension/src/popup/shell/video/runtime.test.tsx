// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { beforeEach, expect, it, vi } from 'vitest';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';

const mocks = vi.hoisted(() => ({
  mediaEffects: vi.fn(),
  persistenceEffects: vi.fn(),
  refreshGalleryStatus: vi.fn(),
}));

vi.mock('../runtime/actions', () => ({
  usePopupRuntimeActions: () => ({
    refreshActiveTabCapabilities: vi.fn(),
    refreshGalleryStatus: mocks.refreshGalleryStatus,
    refreshMicrophones: vi.fn(),
    refreshWebcams: vi.fn(),
  }),
}));
vi.mock('../runtime/media-device-effects', () => ({
  usePopupMediaDeviceEffects: mocks.mediaEffects,
}));
vi.mock('../runtime/video-persistence-effects', () => ({
  usePopupVideoPersistenceEffects: mocks.persistenceEffects,
}));

beforeEach(() => vi.clearAllMocks());

it('owns only Video state and starts device work after route bootstrap', async () => {
  const { useVideoRouteRuntime } = await import('./runtime');
  let latest!: ReturnType<typeof useVideoRouteRuntime>;
  function Harness() {
    latest = useVideoRouteRuntime({
      capabilities: getTabCapabilities(null),
      initialMode: CaptureMode.CAMERA,
    });
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));

  expect(latest).not.toHaveProperty('session');
  expect(latest.presets.videoCaptureMode).toBe(CaptureMode.CAMERA);
  expect(mocks.mediaEffects).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'menu' }));

  act(() => latest.setIsReady(true));
  expect(mocks.mediaEffects).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'video' }));
  expect(mocks.refreshGalleryStatus).toHaveBeenCalledOnce();
  act(() => root.unmount());
});

it.each(['old-recording', 'old-idle', 'failure'] as const)(
  'preserves the newer recording and capability after a delayed refresh: %s',
  async (replyKind) => {
    const { useVideoRouteRuntime } = await import('./runtime');
    const { usePopupRuntimeHandlers } = await import('../runtime/handlers');
    const { installPopupRuntimeMessagingMock, resetPopupRuntimeMessagingMock } =
      await import('../runtime/services.test-support');
    let resolveReply: (reply: unknown) => void = () => undefined;
    let rejectReply: (error: Error) => void = () => undefined;
    const response = new Promise<unknown>((resolve, reject) => {
      resolveReply = resolve;
      rejectReply = reject;
    });
    installPopupRuntimeMessagingMock(() => response);
    let latest!: ReturnType<typeof useVideoRouteRuntime>;
    let handlers!: ReturnType<typeof usePopupRuntimeHandlers>;
    function Harness() {
      latest = useVideoRouteRuntime({ capabilities: getTabCapabilities(null) });
      handlers = usePopupRuntimeHandlers(latest, latest.getRecordingRevision);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      act(() => root.render(<Harness />));
      const original = latest.recording.recordingState;
      let refresh!: Promise<void>;
      act(() => {
        refresh = handlers.handleRefreshRecordingState();
      });
      const newer = { ...original, status: VideoRecordingStatus.RECORDING, duration: 12 };
      const capability = { recordingId: 'recording-b', controlToken: 'token-b' };
      act(() => {
        latest.recording.setRecordingState(newer);
        latest.recording.setRecordingControlCapability(capability);
      });
      await act(async () => {
        if (replyKind === 'failure') rejectReply(new Error('late transport failure'));
        else
          resolveReply({
            success: true,
            state:
              replyKind === 'old-recording'
                ? { ...original, status: VideoRecordingStatus.STOPPING }
                : original,
            ...(replyKind === 'old-recording'
              ? { recordingId: 'recording-a', controlToken: 'token-a' }
              : {}),
          });
        await refresh;
      });
      expect(latest.recording.recordingState).toEqual(newer);
      expect(latest.recording.recordingControlCapability).toEqual(capability);
    } finally {
      act(() => root.unmount());
      resetPopupRuntimeMessagingMock();
    }
  }
);
