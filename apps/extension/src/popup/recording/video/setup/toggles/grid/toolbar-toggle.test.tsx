import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { VideoRecordingToolbarToggle } from './toolbar-toggle';

it('preserves every spotlight preference while toggling toolbar auto-open', () => {
  const onSettingsChange = vi.fn();
  const element = VideoRecordingToolbarToggle({
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: {
        toolbarEnabled: false,
        cursorSpotlightEnabled: true,
        cursorDimmingEnabled: true,
        cursorClickAnimationEnabled: true,
      },
    },
    onSettingsChange,
  });

  expect(element.props.active).toBe(false);
  element.props.onClick();
  expect(onSettingsChange).toHaveBeenCalledWith({
    recordingSurface: {
      toolbarEnabled: true,
      cursorSpotlightEnabled: true,
      cursorDimmingEnabled: true,
      cursorClickAnimationEnabled: true,
    },
  });
});

it('defaults the missing recording surface preferences while enabling the toolbar', () => {
  const onSettingsChange = vi.fn();
  const { recordingSurface: _recordingSurface, ...settings } = DEFAULT_VIDEO_SETTINGS;
  const element = VideoRecordingToolbarToggle({
    settings,
    onSettingsChange,
  });
  element.props.onClick();
  expect(onSettingsChange).toHaveBeenCalledWith({
    recordingSurface: { toolbarEnabled: true, cursorSpotlightEnabled: false },
  });
});

it('keeps the toolbar control mounted but disabled outside tab capture', () => {
  const element = VideoRecordingToolbarToggle({
    settings: DEFAULT_VIDEO_SETTINGS,
    disabled: true,
    onSettingsChange: vi.fn(),
  });

  expect(element.props.disabled).toBe(true);
  expect(element.props.description).toBe('popup.video.recordingToolbarDisabledDescription');
});
