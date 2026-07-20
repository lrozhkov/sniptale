import { describe, expect, it, vi } from 'vitest';
import { VideoTransitionTemplateKind } from '../../../../../features/video/project/types';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { getTransitionTemplateOptions } from './transition-options';

describe('transition-options', () => {
  it('threads transition family labels into grouped template options', () => {
    expect(getTransitionTemplateOptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'videoEditor.templates.transitionDescriptionCrossfade',
          groupLabel: 'videoEditor.templates.transitionGroupCore',
          label: 'videoEditor.sidebar.transitionCrossfade',
          value: VideoTransitionTemplateKind.CROSSFADE,
        }),
        expect.objectContaining({
          description: 'videoEditor.templates.transitionDescriptionFadeThroughLight',
          groupLabel: 'videoEditor.templates.transitionGroupCore',
          label: 'videoEditor.sidebar.transitionFadeThroughLight',
          value: VideoTransitionTemplateKind.FADE_THROUGH_LIGHT,
        }),
        expect.objectContaining({
          description: 'videoEditor.templates.transitionDescriptionLightSweep',
          groupLabel: 'videoEditor.templates.transitionGroupReveal',
          label: 'videoEditor.sidebar.transitionLightSweep',
          value: VideoTransitionTemplateKind.LIGHT_SWEEP,
        }),
      ])
    );
  });
});
