// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import { IDLE_RECORDING_STATE } from '../../recording/video/copy';
import type { PopupVideoRuntimeStateSlice } from './types/internal-state';
import { usePopupRuntimeHandlers } from './handlers';
import {
  installPopupRuntimeMessagingMock,
  resetPopupRuntimeMessagingMock,
} from './services.test-support';

const sendMessage = vi.fn();
let root: Root;
let container: HTMLDivElement;
let state: PopupVideoRuntimeStateSlice;
let handlers: ReturnType<typeof usePopupRuntimeHandlers>;
function Harness() {
  handlers = usePopupRuntimeHandlers(state, () => 0);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sendMessage.mockReset();
  installPopupRuntimeMessagingMock(sendMessage);
  state = createVideoState();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetPopupRuntimeMessagingMock();
  vi.unstubAllGlobals();
});

it('refreshes terminal state and its exact capability for cleanup retry', async () => {
  const completion = { discard: true, outcome: 'stopped', pending: false };
  const terminal = { ...IDLE_RECORDING_STATE, status: VideoRecordingStatus.STOPPING, completion };
  const capability = { recordingId: 'recording-a', controlToken: 'token-a' };
  sendMessage.mockResolvedValue({ success: true, state: terminal, ...capability });
  await act(async () => handlers.handleRefreshRecordingState());
  expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_RECORDING_STATE' });
  expect(state.recording.setRecordingState).toHaveBeenCalledWith(terminal);
  expect(state.recording.setRecordingControlCapability).toHaveBeenCalledWith(capability);
});

it('clears the retired capability after authoritative idle refresh', async () => {
  sendMessage.mockResolvedValue({ success: true, state: IDLE_RECORDING_STATE });
  await act(async () => handlers.handleRefreshRecordingState());
  expect(state.recording.setRecordingState).toHaveBeenCalledWith(IDLE_RECORDING_STATE);
  expect(state.recording.setRecordingControlCapability).toHaveBeenCalledWith(null);
});

it.each([undefined, { success: false }, { success: true }])(
  'preserves recording state and capability when refresh has no authoritative state: %j',
  async (response) => {
    sendMessage.mockResolvedValue(response);
    await act(async () => handlers.handleRefreshRecordingState());
    expect(state.recording.setRecordingControlCapability).not.toHaveBeenCalled();
    const setter = vi.mocked(state.recording.setRecordingState).mock.calls[0]?.[0];
    expect(typeof setter).toBe('function');
    if (typeof setter !== 'function') throw new Error('Expected an error-only update');
    const current = { ...IDLE_RECORDING_STATE, status: VideoRecordingStatus.STOPPING };
    expect(setter(current)).toEqual({ ...current, error: expect.any(String) });
  }
);

it('reports transport loss without replacing the last authoritative status', async () => {
  sendMessage.mockRejectedValue(new Error('transport lost'));
  await act(async () => handlers.handleRefreshRecordingState());
  expect(state.recording.setRecordingControlCapability).not.toHaveBeenCalled();
  expect(state.recording.setRecordingState).toHaveBeenCalledWith(expect.any(Function));
});

function createVideoState(): PopupVideoRuntimeStateSlice {
  const noDevices = vi.fn(async () => []);
  return {
    actions: { refreshMicrophones: noDevices, refreshWebcams: noDevices },
    devices: {
      microphoneDevices: [],
      isLoadingMicrophones: false,
      webcamDevices: [],
      isLoadingWebcams: false,
      setMicrophoneDevices: vi.fn(),
      setWebcamDevices: vi.fn(),
      setIsLoadingMicrophones: vi.fn(),
      setIsLoadingWebcams: vi.fn(),
    },
    environment: {
      activeTabCapabilities: getTabCapabilities(null),
      galleryStatus: null,
      setActiveTabCapabilities: vi.fn(),
      setGalleryStatus: vi.fn(),
    },
    presets: {
      selectedPreset: null,
      selectedPresetId: null,
      setSelectedPresetId: vi.fn(),
      setVideoCaptureMode: vi.fn(),
      setViewportPresets: vi.fn(),
      videoCaptureMode: CaptureMode.TAB,
      viewportPresets: [],
    },
    recording: {
      recordingControlCapability: null,
      videoSettings: DEFAULT_VIDEO_SETTINGS,
      recordingState: IDLE_RECORDING_STATE,
      startError: null,
      isStartPending: false,
      recordingActive: false,
      setVideoSettings: vi.fn(),
      setRecordingState: vi.fn(),
      setRecordingControlCapability: vi.fn(),
      setStartError: vi.fn(),
      setIsStartPending: vi.fn(),
      clearStartError: vi.fn(),
    },
  };
}

it('keeps the newest refresh when two state requests finish out of order', async () => {
  let release: (value: unknown) => void = () => undefined;
  const older = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const newest = { ...IDLE_RECORDING_STATE, status: VideoRecordingStatus.STOPPING };
  sendMessage.mockReturnValueOnce(older).mockResolvedValueOnce({ success: true, state: newest });
  let first!: Promise<void>;
  await act(async () => {
    first = handlers.handleRefreshRecordingState();
    await handlers.handleRefreshRecordingState();
  });
  await act(async () => {
    release({ success: true, state: IDLE_RECORDING_STATE });
    await first;
  });
  expect(state.recording.setRecordingState).toHaveBeenCalledExactlyOnceWith(newest);
  expect(state.recording.setRecordingControlCapability).toHaveBeenCalledExactlyOnceWith(null);
});
