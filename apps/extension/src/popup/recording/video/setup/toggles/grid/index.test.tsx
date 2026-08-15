import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n/popup', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

import { VideoToggleGrid } from './';
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

function createSettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    microphoneDeviceId: 'mic-1',
    systemAudioEnabled: true,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.MEDIUM },
    countdownSeconds: 3,
    autoFadeDelay: 2,
    interactionDiagnosticsEnabled: true,
    controlledCursorCaptureEnabled: false,
  };
}

describe('video toggle grid view', () => {
  it('exports the composed toggle grid component', () => {
    expect(VideoToggleGrid).toBeTypeOf('function');
  });

  it('composes the owner-local toggle slices', () => {
    const onToggleMicrophone = vi.fn();
    const onToggleWebcam = vi.fn();
    const onSettingsChange = vi.fn();

    const element = VideoToggleGrid({
      captureMode: CaptureMode.SCREEN,
      settings: createSettings(),
      controlledCursorDisabled: true,
      controlledCursorDisabledReason: 'unsupported',
      systemAudioDisabled: false,
      onToggleMicrophone,
      onToggleWebcam,
      onSettingsChange,
    });

    expect(element.props.className).toContain('grid-cols-5');
    expect(element.props.children).toHaveLength(5);
    expect(element.props.children[3].props.disabled).toBe(true);
    expect(element.props.children[4].props.disabled).toBe(true);
    expect(element.props.children[4].props.disabledReason).toBe('unsupported');
  });

  it('adds the recording toolbar toggle only for tab-based capture', () => {
    const sharedProps = {
      settings: createSettings(),
      controlledCursorDisabled: false,
      controlledCursorDisabledReason: null,
      systemAudioDisabled: false,
      onToggleMicrophone: vi.fn(),
      onToggleWebcam: vi.fn(),
      onSettingsChange: vi.fn(),
    };

    for (const captureMode of [CaptureMode.TAB, CaptureMode.TAB_CROP]) {
      const element = VideoToggleGrid({ ...sharedProps, captureMode });
      expect(element.props.className).toContain('grid-cols-5');
      expect(element.props.children).toHaveLength(5);
      expect(element.props.children[3]).not.toBeNull();
    }

    const camera = VideoToggleGrid({ ...sharedProps, captureMode: CaptureMode.CAMERA });
    expect(camera.props.className).toContain('grid-cols-5');
    expect(camera.props.children[3].props.disabled).toBe(true);
  });

  it('forces the webcam toggle active and disabled when camera mode locks the webcam', () => {
    const element = VideoToggleGrid({
      captureMode: CaptureMode.CAMERA,
      settings: { ...createSettings(), webcamEnabled: false },
      controlledCursorDisabled: true,
      controlledCursorDisabledReason: 'camera mode',
      systemAudioDisabled: true,
      webcamLocked: true,
      onSettingsChange: vi.fn(),
      onToggleMicrophone: vi.fn(),
      onToggleWebcam: vi.fn(),
    });

    expect(element.props.children[1].props.active).toBe(true);
    expect(element.props.children[1].props.disabled).toBe(true);
  });
});
