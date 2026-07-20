import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

import { VideoToggleGrid } from './';
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

function createSettings(): VideoRecordingSettings {
  return {
    microphoneEnabled: true,
    microphoneDeviceId: 'mic-1',
    systemAudioEnabled: true,
    quality: VideoQuality.MEDIUM,
    countdownSeconds: 3,
    autoFadeDelay: 2,
    openEditorAfterRecording: false,
    diagnosticsEnabled: true,
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
      diagnosticsDisabled: false,
      onToggleMicrophone,
      onToggleWebcam,
      onSettingsChange,
    });

    expect(element.props.className).toContain('grid-cols-6');
    expect(element.props.children).toHaveLength(6);
    expect(element.props.children[4].props.disabled).toBe(true);
    expect(element.props.children[4].props.disabledReason).toBe('unsupported');
  });

  it('forces the webcam toggle active and disabled when camera mode locks the webcam', () => {
    const element = VideoToggleGrid({
      captureMode: CaptureMode.CAMERA,
      settings: { ...createSettings(), webcamEnabled: false },
      controlledCursorDisabled: true,
      controlledCursorDisabledReason: 'camera mode',
      diagnosticsDisabled: true,
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
