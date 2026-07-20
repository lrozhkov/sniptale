import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { VideoMicrophoneToggle } from './microphone';

describe('video microphone toggle', () => {
  it('exports the microphone toggle component', () => {
    expect(VideoMicrophoneToggle).toBeTypeOf('function');
  });

  it('passes the active state and click handler through the icon button', () => {
    const onToggleMicrophone = vi.fn();
    const element = VideoMicrophoneToggle({
      active: true,
      onToggleMicrophone,
    });

    expect(element.props.active).toBe(true);
    expect(element.props.geometry).toBe('square');
    element.props.onClick();
    expect(onToggleMicrophone).toHaveBeenCalledTimes(1);
  });
});
