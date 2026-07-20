// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { usePopupRuntimeState } from './state';

const {
  getTabCapabilitiesMock,
  isRecordingActiveMock,
  resolveSelectedPresetMock,
  shouldShowFooterMock,
  usePopupRuntimeActionsMock,
  usePopupRuntimeEffectsMock,
} = vi.hoisted(() => ({
  getTabCapabilitiesMock: vi.fn(() => ({ kind: 'supported', reason: null })),
  isRecordingActiveMock: vi.fn((state) => state.status === VideoRecordingStatus.RECORDING),
  resolveSelectedPresetMock: vi.fn(
    (presets: Array<{ id: string }>, presetId: string | null) =>
      presets.find((preset) => preset.id === presetId) ?? null
  ),
  shouldShowFooterMock: vi.fn((page) => page !== 'export'),
  usePopupRuntimeActionsMock: vi.fn(() => ({
    refreshActiveTabCapabilities: vi.fn(async () => undefined),
    refreshGalleryStatus: vi.fn(async () => undefined),
    refreshMicrophones: vi.fn(async () => []),
    refreshWebcams: vi.fn(async () => []),
  })),
  usePopupRuntimeEffectsMock: vi.fn(),
}));

vi.mock('../../../features/tab-capabilities/capabilities', (_importOriginal) => ({
  getTabCapabilities: getTabCapabilitiesMock,
}));

vi.mock('../navigation/actions', (_importOriginal) => ({
  IDLE_RECORDING_STATE: {
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: VideoRecordingStatus.IDLE,
    viewportPreset: null,
  },
}));

vi.mock('./model', (_importOriginal) => ({
  isRecordingActive: isRecordingActiveMock,
  resolveSelectedPreset: resolveSelectedPresetMock,
  shouldShowFooter: shouldShowFooterMock,
}));

vi.mock('./effects', (_importOriginal) => ({
  usePopupRuntimeActions: usePopupRuntimeActionsMock,
  usePopupRuntimeEffects: usePopupRuntimeEffectsMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof usePopupRuntimeState> | null = null;

function HookHarness() {
  latestState = usePopupRuntimeState();
  return null;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<HookHarness />);
  });
}

function cleanupHarness() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

function expectInitialPopupRuntimeState() {
  expect(getTabCapabilitiesMock).toHaveBeenCalledWith(null);
  expect(usePopupRuntimeActionsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      microphoneDevices: [],
      webcamDevices: [],
      setGalleryStatus: expect.any(Function),
      setIsLoadingWebcams: expect.any(Function),
      setWebcamDevices: expect.any(Function),
    })
  );
  expect(usePopupRuntimeEffectsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isReady: false,
      page: 'home',
      refreshMicrophones: expect.any(Function),
      refreshWebcams: expect.any(Function),
      setVideoSettings: expect.any(Function),
      videoCaptureMode: CaptureMode.TAB,
    })
  );
  expect(latestState).toEqual(
    expect.objectContaining({
      actions: expect.objectContaining({
        refreshGalleryStatus: expect.any(Function),
      }),
      derived: expect.objectContaining({
        showFooter: true,
      }),
      devices: expect.objectContaining({
        isLoadingWebcams: false,
      }),
      presets: expect.objectContaining({
        appliedViewportPresetId: null,
        appliedViewportTabId: null,
        quickActionsReady: false,
        selectedPreset: null,
        videoCaptureMode: CaptureMode.TAB,
      }),
      recording: expect.objectContaining({
        recordingActive: false,
      }),
      session: expect.objectContaining({
        page: 'home',
      }),
    })
  );
}

async function updatePopupRuntimeState() {
  await act(async () => {
    latestState?.presets.setViewportPresets([
      { height: 720, id: 'preset-1', label: 'Wide', width: 1280 },
    ]);
    latestState?.presets.setSelectedPresetId('preset-1');
    latestState?.presets.setAppliedViewportPresetId('preset-1');
    latestState?.presets.setAppliedViewportTabId(1);
    latestState?.presets.setVideoCaptureMode(CaptureMode.TAB_CROP);
    latestState?.presets.setQuickActionsReady(true);
    latestState?.recording.setRecordingState({
      captureMode: CaptureMode.TAB,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.RECORDING,
      viewportPreset: null,
    });
    latestState?.session.setPage('export');
    latestState?.recording.setStartError('boom');
  });
}

function expectUpdatedPopupRuntimeState() {
  expect(latestState?.presets.selectedPreset).toEqual(
    expect.objectContaining({ id: 'preset-1', label: 'Wide' })
  );
  expect(latestState?.presets.appliedViewportPresetId).toBe('preset-1');
  expect(latestState?.presets.appliedViewportTabId).toBe(1);
  expect(latestState?.presets.quickActionsReady).toBe(true);
  expect(latestState?.presets.videoCaptureMode).toBe(CaptureMode.TAB_CROP);
  expect(latestState?.recording.recordingActive).toBe(true);
  expect(latestState?.derived.showFooter).toBe(false);
}

describe('usePopupRuntimeState', () => {
  beforeEach(() => {
    latestState = null;
    usePopupRuntimeActionsMock.mockClear();
    usePopupRuntimeEffectsMock.mockClear();
  });

  afterEach(cleanupHarness);

  it('builds popup runtime state from core state, derived view-model state, and runtime actions', async () => {
    await renderHarness();
    expectInitialPopupRuntimeState();
  });

  it('updates derived state when presets, page, recording status, and start errors change', async () => {
    await renderHarness();
    await updatePopupRuntimeState();
    expectUpdatedPopupRuntimeState();

    act(() => {
      latestState?.recording.clearStartError();
    });

    expect(latestState?.recording.startError).toBeNull();
  });
});
