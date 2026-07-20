import { describe, expect, it, vi } from 'vitest';
import { VideoMediaFitMode } from '../../../../../features/video/project/types';
import {
  getLegacyMediaFitModeOptions,
  getMediaFitModeOptions,
  normalizeLegacyMediaFitMode,
} from './media-fit-options';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('media-fit-options', () => {
  it('builds active fit mode options including cover and stretch', () => {
    expect(getMediaFitModeOptions()).toEqual([
      { value: VideoMediaFitMode.CONTAIN, label: 'videoEditor.sidebar.fitModeContain' },
      { value: VideoMediaFitMode.SOURCE_100, label: 'videoEditor.sidebar.fitModeSource100' },
      { value: VideoMediaFitMode.FIT_LONG_SIDE, label: 'videoEditor.sidebar.fitModeLongSide' },
      { value: VideoMediaFitMode.FIT_SHORT_SIDE, label: 'videoEditor.sidebar.fitModeShortSide' },
      { value: VideoMediaFitMode.COVER, label: 'videoEditor.sidebar.fitModeCover' },
      { value: VideoMediaFitMode.STRETCH, label: 'videoEditor.sidebar.fitModeStretch' },
    ]);
  });

  it('builds legacy fit mode options without cover and stretch', () => {
    expect(getLegacyMediaFitModeOptions()).toEqual([
      { value: VideoMediaFitMode.CONTAIN, label: 'videoEditor.sidebar.fitModeContain' },
      { value: VideoMediaFitMode.SOURCE_100, label: 'videoEditor.sidebar.fitModeSource100' },
      { value: VideoMediaFitMode.FIT_LONG_SIDE, label: 'videoEditor.sidebar.fitModeLongSide' },
      { value: VideoMediaFitMode.FIT_SHORT_SIDE, label: 'videoEditor.sidebar.fitModeShortSide' },
    ]);
  });

  it('normalizes legacy fit mode values away from cover and stretch', () => {
    expect(normalizeLegacyMediaFitMode(VideoMediaFitMode.COVER)).toBe(VideoMediaFitMode.CONTAIN);
    expect(normalizeLegacyMediaFitMode(VideoMediaFitMode.STRETCH)).toBe(VideoMediaFitMode.CONTAIN);
    expect(normalizeLegacyMediaFitMode(VideoMediaFitMode.FIT_LONG_SIDE)).toBe(
      VideoMediaFitMode.FIT_LONG_SIDE
    );
  });
});
