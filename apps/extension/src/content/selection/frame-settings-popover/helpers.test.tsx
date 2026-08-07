import { describe, expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import { buildBlurTypeOptions } from '../../../composition/frame-annotation-controls/frame/helpers';

describe('frame blur type options', () => {
  it('uses the canonical Gauss, Wave, and Marker catalog', () => {
    expect(buildBlurTypeOptions()).toEqual([
      {
        value: 'gaussian',
        label: translate('content.overlayControls.blurTypeGaussian'),
        iconName: 'droplet',
      },
      {
        value: 'distortion',
        label: translate('content.overlayControls.blurTypeDistortion'),
        iconName: 'waves',
      },
      {
        value: 'solid',
        label: translate('content.overlayControls.blurTypeSolid'),
        iconName: 'square',
      },
    ]);
  });
});
