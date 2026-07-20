import { expect, it } from 'vitest';
import { getVideoTransitionTemplateDefinition } from './template-registry';
import { resolveTransitionTemplateControls } from './template-controls';
import { VideoTransitionTemplateKind } from '../types/index';

it('resolves template-first control capabilities for transition inspectors', () => {
  expect(
    resolveTransitionTemplateControls(
      getVideoTransitionTemplateDefinition(VideoTransitionTemplateKind.LIGHT_SWEEP)
    )
  ).toEqual({
    showMotionGroup: true,
    showStyleGroup: true,
    showTemplateField: true,
    supportsDirection: true,
    supportsDuration: true,
    supportsEasing: true,
    supportsHighlightColor: true,
    supportsIntensity: true,
  });
  expect(
    resolveTransitionTemplateControls(
      getVideoTransitionTemplateDefinition(VideoTransitionTemplateKind.CROSSFADE)
    )
  ).toEqual({
    showMotionGroup: true,
    showStyleGroup: false,
    showTemplateField: true,
    supportsDirection: false,
    supportsDuration: true,
    supportsEasing: true,
    supportsHighlightColor: false,
    supportsIntensity: true,
  });
});
