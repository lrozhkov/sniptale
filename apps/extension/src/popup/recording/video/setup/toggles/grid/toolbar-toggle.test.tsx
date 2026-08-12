import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { VideoRecordingToolbarToggle } from './toolbar-toggle';

it('preserves spotlight preference while toggling toolbar auto-open', () => {
  const onSettingsChange = vi.fn();
  const element = VideoRecordingToolbarToggle({
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: { toolbarEnabled: false, cursorSpotlightEnabled: true },
    },
    onSettingsChange,
  });

  expect(element.props.active).toBe(false);
  element.props.onClick();
  expect(onSettingsChange).toHaveBeenCalledWith({
    recordingSurface: { toolbarEnabled: true, cursorSpotlightEnabled: true },
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
