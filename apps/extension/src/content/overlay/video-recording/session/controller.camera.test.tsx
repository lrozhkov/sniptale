// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Camera, CameraOff } from 'lucide-react';
import { RecordingMediaSplitControl } from '../../toolbar/video-recording/media-menu';
import { DEFAULT_WEBCAM_APPEARANCE } from '../../../../features/video/recording/webcam-presentation';
import { translate } from '../../../../platform/i18n';
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

it('projects accepted camera placement and disposable geometry through failure and delayed commits', async () => {
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
    const current = controller;
    return (
      <RecordingMediaSplitControl
        active
        activeIcon={Camera}
        inactiveIcon={CameraOff}
        disabled={false}
        kind="videoinput"
        dataUi="test.camera"
        displayMode="horizontal"
        label="Camera"
        selectedDeviceId={null}
        onToggle={vi.fn()}
        cameraPlacement={{
          mode: 'embedded',
          locked: false,
          onChange: current.onCameraPresentationModeChange,
          presentation: current.state.webcamPresentation,
          onAppearanceChange: (patch) => current.onCameraGeometryChange(patch),
        }}
      />
    );
  }
  const host = document.createElement('div');
  const root = createRoot(host);
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
    act(() => mocks.listener?.(snapshot, 'token-1'));
    mocks.command.mockClear();
    const first = { ...snapshot.webcamPresentation, sizeFraction: 0.3 };
    const later = { ...snapshot.webcamPresentation, sizeFraction: 0.4 };
    act(() => controller.onCameraGeometryPreview(later));
    expect(controller!.state.webcamPresentation.sizeFraction).toBe(0.4);
    expect(mocks.command).not.toHaveBeenCalled();
    mocks.command.mockRejectedValueOnce(new Error('refused'));
    await act(async () => {
      await expect(controller.onCameraGeometryChange(later)).rejects.toThrow('refused');
    });
    expect(controller!.state.webcamPresentation).toEqual(snapshot.webcamPresentation);
    let finish!: (value: { snapshot: VideoRecordingSurfaceSnapshot }) => void;
    mocks.command.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => controller.onCameraGeometryPreview(first));
    let write!: Promise<void>;
    act(() => {
      write = controller.onCameraGeometryChange(first);
    });
    act(() => controller.onCameraGeometryPreview(later));
    await act(async () => {
      finish({ snapshot: { ...snapshot, webcamPresentation: first } });
      await write;
    });
    expect(controller!.state.webcamPresentation.sizeFraction).toBe(0.4);
    act(() => controller.onCameraGeometryPreview(null));
    expect(controller!.state.webcamPresentation.sizeFraction).toBe(0.3);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')!.click()
    );
    for (const firstControl of ['Square', 'Mirror'] as const) {
      act(() => mocks.listener?.(snapshot, 'token-1'));
      mocks.command.mockClear();
      let accept!: (value: { snapshot: VideoRecordingSurfaceSnapshot }) => void;
      const firstPresentation = {
        ...snapshot.webcamPresentation,
        shape: firstControl === 'Square' ? ('square' as const) : snapshot.webcamPresentation.shape,
        appearance: { ...DEFAULT_WEBCAM_APPEARANCE, mirror: firstControl === 'Mirror' },
      };
      mocks.command.mockReturnValueOnce(
        new Promise((resolve) => {
          accept = resolve;
        })
      );
      mocks.command.mockResolvedValueOnce({
        snapshot: {
          ...snapshot,
          webcamPresentation: {
            ...firstPresentation,
            appearance: { ...firstPresentation.appearance, shadow: false },
          },
        },
      });
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            `[aria-label="${translate(`popup.video.webcamPresentation${firstControl}`)}"]`
          )!
          .click()
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            `[aria-label="${translate('popup.video.webcamPresentationShadow')}"]`
          )!
          .click()
      );
      expect(mocks.command).toHaveBeenCalledTimes(1);
      await act(async () =>
        accept({ snapshot: { ...snapshot, webcamPresentation: firstPresentation } })
      );
      expect(mocks.command).toHaveBeenCalledTimes(2);
      expect(mocks.command).toHaveBeenLastCalledWith(expect.any(Object), {
        kind: 'update-embedded-camera',
        appearance: expect.objectContaining({
          shape: firstPresentation.shape,
          appearance: expect.objectContaining({ mirror: firstControl === 'Mirror', shadow: false }),
        }),
      });
    }
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
