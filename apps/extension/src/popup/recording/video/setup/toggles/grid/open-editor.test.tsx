import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { VideoOpenEditorToggle } from './open-editor';

describe('video open editor toggle', () => {
  it('exports the open editor toggle component', () => {
    expect(VideoOpenEditorToggle).toBeTypeOf('function');
  });

  it('flips the open-editor setting through the icon button', () => {
    const onSettingsChange = vi.fn();
    const element = VideoOpenEditorToggle({
      openEditorAfterRecording: false,
      onSettingsChange,
    });

    expect(element.props.active).toBe(false);
    expect(element.props.geometry).toBe('square');
    element.props.onClick();
    expect(onSettingsChange).toHaveBeenCalledWith({ openEditorAfterRecording: true });
  });
});
