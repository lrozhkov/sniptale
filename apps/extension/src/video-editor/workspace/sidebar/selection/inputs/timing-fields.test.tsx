import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../../features/video/project/types';
import { renderClipTimingFields } from './timing-fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createVideoClip(fitMode: VideoMediaFitMode): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 10,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode,
    groupId: null,
    id: 'video-1',
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: 'Video',
    sourceDuration: 10,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-1',
    transform: { height: 360, opacity: 1, rotation: 0, width: 640, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 80,
  };
}

describe('timing-fields', () => {
  it('keeps media fit controls out of timing fields', () => {
    const markup = renderToStaticMarkup(
      renderClipTimingFields(createVideoClip(VideoMediaFitMode.COVER), false, vi.fn(), vi.fn())
    );

    expect(markup).toContain('videoEditor.sidebar.fadeInLabel');
    expect(markup).toContain('videoEditor.sidebar.playbackRateLabel');
    expect(markup).not.toContain('videoEditor.sidebar.fitModeLabel');
    expect(markup).not.toContain('videoEditor.sidebar.fitModeCover');
    expect(markup).not.toContain('videoEditor.sidebar.fitModeStretch');
  });
});
