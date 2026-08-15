// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadVideo: vi.fn(),
  loadRecording: vi.fn(),
  setup: vi.fn(),
  setActiveTabCapabilities: vi.fn(),
  setIsReady: vi.fn(),
  setIsStartPending: vi.fn(),
  setRecordingControlCapability: vi.fn(),
  setRecordingState: vi.fn(),
  setSelectedPresetId: vi.fn(),
  setStartError: vi.fn(),
  setVideoCaptureMode: vi.fn(),
  setVideoSettings: vi.fn(),
  setViewportPresets: vi.fn(),
}));

const state = {
  environment: { setActiveTabCapabilities: mocks.setActiveTabCapabilities },
  presets: {
    setSelectedPresetId: mocks.setSelectedPresetId,
    setVideoCaptureMode: mocks.setVideoCaptureMode,
    setViewportPresets: mocks.setViewportPresets,
  },
  recording: {
    setIsStartPending: mocks.setIsStartPending,
    setRecordingControlCapability: mocks.setRecordingControlCapability,
    setRecordingState: mocks.setRecordingState,
    setStartError: mocks.setStartError,
    setVideoSettings: mocks.setVideoSettings,
  },
  setIsReady: mocks.setIsReady,
};

vi.mock('./runtime', () => ({ useVideoRouteRuntime: () => state }));
vi.mock('../../shell/runtime/handlers', () => ({ usePopupRuntimeHandlers: () => ({}) }));
vi.mock('../../shell/runtime/assembly', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shell/runtime/assembly')>()),
  assemblePopupVideoRuntimeState: () => ({}),
}));
vi.mock('../../shell/runtime/page-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shell/runtime/page-access')>()),
  usePopupPageAccessRuntime: () => ({}),
}));
vi.mock('../../shell/tab-access/capabilities', () => ({
  useActiveTabCapabilities: () => ({ tabId: 5 }),
}));
vi.mock('../../shell/app-shell/video-setup/props', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shell/app-shell/video-setup/props')>()),
  getPopupVideoSetupProps: () => ({ marker: true }),
}));
vi.mock('./setup', () => ({
  default: (props: unknown) => {
    mocks.setup(props);
    return <div data-testid="video-setup" />;
  },
}));
vi.mock('../../shell/bootstrap/video', () => ({
  createPopupVideoBootstrapPromises: () => ({}),
  loadPopupBootstrapVideoData: mocks.loadVideo,
}));
vi.mock('../../shell/bootstrap/runtime', () => ({ popupBootstrapTransport: {} }));
vi.mock('../../shell/bootstrap/recording-state', () => ({
  loadRecordingStateResponseWithFallback: mocks.loadRecording,
  resolvePopupBootstrapRecordingState: (response: { state: unknown }) => ({
    recordingState: response.state,
    recordingStatusError: 'recording-error',
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadVideo.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    selectedPresetId: 'preset',
    videoSettings: { quality: 'HIGH' },
    viewportPresets: [{ id: 'preset' }],
  });
  mocks.loadRecording.mockResolvedValue({
    controlToken: 'token',
    recordingId: 'recording',
    state: { status: VideoRecordingStatus.IDLE },
  });
});

function renderRoute(node: ReactNode) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(node));
  return { root, rerender: (next: ReactNode) => act(() => root.render(next)) };
}

it('hydrates only Video state and applies a fixed mode before readiness', async () => {
  const { VideoRoute } = await import('./route');
  const view = renderRoute(
    <VideoRoute startup={{ page: 'video', videoMode: CaptureMode.CAMERA }} />
  );
  await vi.waitFor(() => expect(mocks.setIsReady).toHaveBeenCalledWith(true));
  expect(mocks.setVideoCaptureMode).not.toHaveBeenCalledWith(CaptureMode.TAB);
  expect(mocks.setViewportPresets).toHaveBeenCalledWith([{ id: 'preset' }]);
  expect(mocks.setRecordingControlCapability).toHaveBeenCalledWith({
    controlToken: 'token',
    recordingId: 'recording',
  });
  expect(mocks.setup).toHaveBeenCalledWith({ marker: true });
  act(() => view.root.unmount());
});

it('reconciles recording lifecycle updates owned by the shell subscription', async () => {
  const seed = {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 1,
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPresetId: null,
  } as const;
  const { VideoRoute } = await import('./route');
  const view = renderRoute(<VideoRoute startup={{ page: 'video', recordingSeed: seed }} />);
  await vi.waitFor(() => expect(mocks.setRecordingState).toHaveBeenCalledWith(seed));
  expect(mocks.setIsStartPending).toHaveBeenCalledWith(false);
  expect(mocks.setStartError).toHaveBeenCalledWith(null);

  view.rerender(
    <VideoRoute
      startup={{ page: 'video', recordingStartFailed: true, startError: 'start failed' }}
    />
  );
  expect(mocks.setIsStartPending).toHaveBeenCalledWith(false);
  expect(mocks.setRecordingControlCapability).toHaveBeenCalledWith(null);
  expect(mocks.setStartError).toHaveBeenCalledWith('start failed');

  view.rerender(
    <VideoRoute
      startup={{
        page: 'video',
        recordingSeed: { ...seed, status: VideoRecordingStatus.IDLE },
      }}
    />
  );
  expect(mocks.setRecordingControlCapability).toHaveBeenCalledWith(null);

  view.rerender(<VideoRoute startup={{ page: 'video', recordingStartFailed: true }} />);
  expect(mocks.setStartError).toHaveBeenCalledWith(expect.any(String));
  act(() => view.root.unmount());
});

it('uses the coordinator recording snapshot without a second state request', async () => {
  const seed = {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 1,
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPresetId: null,
  } as const;
  const { VideoRoute } = await import('./route');
  const view = renderRoute(
    <VideoRoute
      startup={{
        page: 'video',
        postRecordSnapshot: {
          result: {
            primaryRecordingId: 'seed-recording',
            projectId: null,
            recordingId: 'seed-recording',
          },
        },
        recordingSnapshot: {
          controlCapability: { controlToken: 'seed-token', recordingId: 'seed-recording' },
          state: seed,
          statusError: null,
        },
      }}
    />
  );
  await vi.waitFor(() => expect(mocks.setIsReady).toHaveBeenCalledWith(true));
  expect(mocks.loadRecording).not.toHaveBeenCalled();
  expect(mocks.setRecordingState).toHaveBeenCalledWith(seed);
  expect(mocks.setRecordingControlCapability).toHaveBeenCalledWith({
    controlToken: 'seed-token',
    recordingId: 'seed-recording',
  });
  expect(mocks.setup).toHaveBeenLastCalledWith(
    expect.objectContaining({
      initialPostRecordResult: expect.objectContaining({ recordingId: 'seed-recording' }),
      initialPostRecordVerified: true,
    })
  );
  act(() => view.root.unmount());
});

it('finishes with a localized error when persisted Video data cannot be read', async () => {
  mocks.loadVideo.mockRejectedValueOnce(new Error('storage failed'));
  const { VideoRoute } = await import('./route');
  const view = renderRoute(<VideoRoute startup={{ page: 'video' }} />);
  await vi.waitFor(() => expect(mocks.setIsReady).toHaveBeenCalledWith(true));
  expect(mocks.setStartError).toHaveBeenCalledWith(expect.any(String));
  act(() => view.root.unmount());
});
