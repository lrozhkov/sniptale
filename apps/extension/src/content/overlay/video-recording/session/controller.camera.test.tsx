// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  listener: null as null | ((snapshot: VideoRecordingSurfaceSnapshot, token: string) => void),
}));
vi.mock('../transport/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transport/client')>()),
  sendVideoRecordingSurfaceCommand: mocks.command,
  subscribeToVideoRecordingSurfaceSnapshots: (listener: typeof mocks.listener) => {
    mocks.listener = listener;
    return vi.fn();
  },
  subscribeToVideoRecordingRuntimeState: () => vi.fn(),
}));
vi.mock('../../toolbar/video-recording/drawing-session', () => ({
  createRecordingDrawingOwner: () => ({
    controller: { session: { clear: vi.fn() } },
    dispose: vi.fn(),
    getAutoHideDelay: () => 0,
    setAutoHideDelay: vi.fn(),
    setClockRunning: vi.fn(),
  }),
}));

import { useVideoRecordingSurfaceController } from './controller';

it('projects accepted camera placement and retains its snapshot when the next write fails', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const snapshot: VideoRecordingSurfaceSnapshot = {
    autoFadeDelay: 0,
    capabilityEpoch: 1,
    cursorSpotlightEnabled: false,
    documentGeneration: 1,
    duration: 0,
    entry: 'manual',
    errorCode: null,
    lifecycle: 'ready',
    microphoneDeviceId: null,
    microphoneEnabled: false,
    peerGeneration: 0,
    recordingId: null,
    status: 'IDLE',
    surfaceSessionId: 'camera-placement',
    toolbarRequested: true,
    webcamDeviceId: null,
    webcamEnabled: false,
    webcamPresentation: { ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!, mode: 'embedded' },
  };
  let controller: ReturnType<typeof useVideoRecordingSurfaceController>;
  function Probe() {
    controller = useVideoRecordingSurfaceController({
      onModeRequested: vi.fn(),
      onToolbarRequested: vi.fn(),
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(<Probe />));
    act(() => mocks.listener?.(snapshot, 'token-1'));
    mocks.command.mockResolvedValueOnce({
      snapshot: {
        ...snapshot,
        webcamPresentation: { ...snapshot.webcamPresentation, mode: 'separate-track' },
      },
    });
    await act(async () => controller.onCameraPresentationModeChange('separate-track'));
    expect(controller!.state.webcamPresentation.mode).toBe('separate-track');
    expect(mocks.command).toHaveBeenLastCalledWith(expect.any(Object), {
      kind: 'set-webcam-presentation-mode',
      mode: 'separate-track',
    });
    mocks.command.mockRejectedValueOnce(new Error('storage failed'));
    await act(async () => {
      await expect(controller.onCameraPresentationModeChange('embedded')).rejects.toThrow(
        'storage failed'
      );
    });
    expect(controller!.state.webcamPresentation.mode).toBe('separate-track');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
