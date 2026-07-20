import { Activity } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../../../../../ui/popup-shell/icon-state-button', () => ({
  PopupIconStateButton: (props: Record<string, unknown>) => props,
}));

import { VideoControlledCursorToggle } from './controlled-cursor';

describe('video controlled cursor toggle', () => {
  it('reflects the current flag and flips it through the settings patch', () => {
    const onSettingsChange = vi.fn();

    const enabledElement = VideoControlledCursorToggle({
      captureMode: CaptureMode.TAB,
      controlledCursorCaptureEnabled: true,
      onSettingsChange,
    });
    const disabledElement = VideoControlledCursorToggle({
      captureMode: CaptureMode.TAB,
      controlledCursorCaptureEnabled: false,
      onSettingsChange,
    });

    expect(enabledElement.props.icon).toBe(Activity);
    expect(enabledElement.props.label).toBe('t:popup.video.controlledCursorLabel');
    expect(enabledElement.props.active).toBe(true);
    expect(enabledElement.props.geometry).toBe('square');
    expect(disabledElement.props.active).toBe(false);

    enabledElement.props.onClick();
    disabledElement.props.onClick();

    expect(onSettingsChange).toHaveBeenNthCalledWith(1, {
      controlledCursorCaptureEnabled: false,
    });
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, {
      controlledCursorCaptureEnabled: true,
    });
  });

  it('disables the toggle and swaps to the unavailable reason when capture mode does not support it', () => {
    const onSettingsChange = vi.fn();

    const disabledElement = VideoControlledCursorToggle({
      captureMode: CaptureMode.SCREEN,
      controlledCursorCaptureEnabled: true,
      disabled: true,
      disabledReason: 'unsupported reason',
      onSettingsChange,
    });

    expect(disabledElement.props.active).toBe(false);
    expect(disabledElement.props.disabled).toBe(true);
    expect(disabledElement.props.description).toBe('unsupported reason');
  });
});
