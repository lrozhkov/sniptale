import { Camera } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../../../../../ui/popup-shell/icon-state-button', (_importOriginal) => ({
  PopupIconStateButton: (props: Record<string, unknown>) => props,
}));

import { VideoWebcamToggle } from './webcam';

describe('video webcam toggle', () => {
  it('reflects the current webcam state and delegates clicks', () => {
    const onToggleWebcam = vi.fn();

    const activeElement = VideoWebcamToggle({ active: true, onToggleWebcam });
    const inactiveElement = VideoWebcamToggle({ active: false, onToggleWebcam });

    expect(activeElement.props.icon).toBe(Camera);
    expect(activeElement.props.label).toBe('t:popup.video.webcamToggleLabel');
    expect(activeElement.props.description).toBe('t:popup.video.webcamToggleDescription');
    expect(activeElement.props.active).toBe(true);
    expect(activeElement.props.geometry).toBe('square');
    expect(inactiveElement.props.active).toBe(false);
    expect(inactiveElement.props.inactiveDecoration).toBe('slash');

    activeElement.props.onClick();

    expect(onToggleWebcam).toHaveBeenCalledOnce();
  });

  it('passes the locked disabled state through to the square icon button', () => {
    const element = VideoWebcamToggle({
      active: true,
      disabled: true,
      onToggleWebcam: vi.fn(),
    });

    expect(element.props.disabled).toBe(true);
    expect(element.props.active).toBe(true);
  });
});
