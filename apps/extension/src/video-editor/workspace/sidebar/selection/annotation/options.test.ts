import { describe, expect, it, vi } from 'vitest';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { getAnnotationTemplateOptions } from './options';

describe('annotation-options', () => {
  it('threads catalog family labels into grouped template options', () => {
    expect(getAnnotationTemplateOptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'videoEditor.templates.overlayDescriptionLowerThirdEditorial',
          groupLabel: 'videoEditor.templates.overlayGroupLowerThirds',
          label: 'videoEditor.sidebar.annotationTemplateLowerThirdEditorial',
          value: VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
        }),
        expect.objectContaining({
          description: 'videoEditor.templates.overlayDescriptionLowerThirdBasic',
          groupLabel: 'videoEditor.templates.overlayGroupLowerThirds',
          label: 'videoEditor.sidebar.annotationTemplateLowerThirdBasic',
          value: VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
        }),
        expect.objectContaining({
          description: 'videoEditor.templates.overlayDescriptionCalloutConnector',
          groupLabel: 'videoEditor.templates.overlayGroupCallouts',
          label: 'videoEditor.sidebar.annotationTemplateCalloutConnector',
          value: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
        }),
      ])
    );
  });
});
