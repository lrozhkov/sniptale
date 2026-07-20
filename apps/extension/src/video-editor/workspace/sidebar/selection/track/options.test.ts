import { describe, expect, it, vi } from 'vitest';
import { VideoSubtitlePlacement } from '../../../../../features/video/project/types';
import { getSubtitlePlacementOptions } from './options';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('track-options', () => {
  it('builds canonical subtitle placement options', () => {
    expect(getSubtitlePlacementOptions()).toEqual([
      {
        label: 'videoEditor.sidebar.subtitlePlacementBottom',
        value: VideoSubtitlePlacement.BOTTOM,
      },
      {
        label: 'videoEditor.sidebar.subtitlePlacementTop',
        value: VideoSubtitlePlacement.TOP,
      },
    ]);
  });
});
