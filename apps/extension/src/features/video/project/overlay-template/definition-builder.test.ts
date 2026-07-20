import { expect, it } from 'vitest';
import { createVideoOverlayTemplateDefinition } from './definition-builder';

it('builds overlay template definitions with stable default durations', () => {
  const definition = createVideoOverlayTemplateDefinition(
    'LOWER_THIRD_BASIC',
    'LOWER_THIRD',
    'RAIL_CARD',
    'SLIDE_CARD',
    'PLATE',
    0,
    'CORE',
    'videoEditor.sidebar.annotationTemplateLowerThirdBasic',
    'videoEditor.templates.overlayDescriptionLowerThirdBasic',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdBasic',
    {
      motionLabelKey: 'videoEditor.templates.previewMotionSlide',
      tone: 'CALM',
      toneLabelKey: 'videoEditor.templates.previewToneCalm',
      variant: 'LOWER_THIRD',
    }
  );

  expect(definition.defaultDurationSeconds).toBe(5);

  const overriddenDefinition = createVideoOverlayTemplateDefinition(
    'LOWER_THIRD_BASIC',
    'LOWER_THIRD',
    'RAIL_CARD',
    'SLIDE_CARD',
    'PLATE',
    0,
    'CORE',
    'videoEditor.sidebar.annotationTemplateLowerThirdBasic',
    'videoEditor.templates.overlayDescriptionLowerThirdBasic',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdBasic',
    {
      motionLabelKey: 'videoEditor.templates.previewMotionSlide',
      tone: 'CALM',
      toneLabelKey: 'videoEditor.templates.previewToneCalm',
      variant: 'LOWER_THIRD',
    },
    { defaultDurationSeconds: 4.2 }
  );

  expect(overriddenDefinition.defaultDurationSeconds).toBe(4.2);
});
