import { expect, it } from 'vitest';
import {
  buildVideoTransitionTemplateGroups,
  buildVideoTransitionTemplateSelectionOrder,
} from './template-catalog';
import {
  type VideoTransitionTemplateDefinition,
  VideoTransitionTemplateCatalogSurface,
} from './template-definition';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';

const SHARED_PREVIEW = {
  motionLabelKey: 'videoEditor.templates.previewMotionReveal',
  tone: 'CALM',
  toneLabelKey: 'videoEditor.templates.previewToneCalm',
  variant: 'TRANSITION',
} as const;

function createDefinition(
  partial: Pick<
    VideoTransitionTemplateDefinition,
    | 'catalogRank'
    | 'catalogStatus'
    | 'catalogSurface'
    | 'groupLabelKey'
    | 'kind'
    | 'labelKey'
    | 'renderKind'
    | 'templateKind'
  >
): VideoTransitionTemplateDefinition {
  return {
    ...partial,
    defaultDurationSeconds: 0.8,
    defaultDirection: 'RIGHT',
    defaultHighlightColor: '#f97316',
    defaultIntensity: 'BALANCED',
    descriptionKey: 'videoEditor.templates.transitionDescriptionCrossfade',
    preview: SHARED_PREVIEW,
    supportsDirection: false,
    supportsHighlightColor: false,
    useCaseKey: 'videoEditor.templates.transitionUseCaseCrossfade',
  };
}

function createCatalogDefinitions() {
  return [
    createDefinition({
      catalogRank: 0,
      catalogStatus: VideoTemplateCatalogStatus.CORE,
      catalogSurface: VideoTransitionTemplateCatalogSurface.SHADER,
      groupLabelKey: 'videoEditor.templates.transitionGroupShader',
      kind: 'LINEAR_WIPE',
      labelKey: 'videoEditor.sidebar.transitionLinearWipe',
      renderKind: 'SHADER',
      templateKind: 'LINEAR_WIPE',
    }),
    createDefinition({
      catalogRank: 1,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      catalogSurface: VideoTransitionTemplateCatalogSurface.PRIMARY,
      groupLabelKey: 'videoEditor.templates.transitionGroupReveal',
      kind: 'LIGHT_SWEEP',
      labelKey: 'videoEditor.sidebar.transitionLightSweep',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
    }),
    createDefinition({
      catalogRank: 0,
      catalogStatus: VideoTemplateCatalogStatus.CORE,
      catalogSurface: VideoTransitionTemplateCatalogSurface.PRIMARY,
      groupLabelKey: 'videoEditor.templates.transitionGroupCore',
      kind: 'CROSSFADE',
      labelKey: 'videoEditor.sidebar.transitionCrossfade',
      renderKind: 'COMPOSITE',
      templateKind: 'CROSSFADE',
    }),
  ] as const satisfies readonly VideoTransitionTemplateDefinition[];
}

it('keeps primary transition catalog ordering independent from shader-only entries', () => {
  const definitions = createCatalogDefinitions();

  expect(buildVideoTransitionTemplateSelectionOrder(definitions)).toEqual([
    'CROSSFADE',
    'LIGHT_SWEEP',
  ]);
  expect(buildVideoTransitionTemplateSelectionOrder(definitions.slice(0, 2))).toEqual([
    'LIGHT_SWEEP',
  ]);
  expect(buildVideoTransitionTemplateGroups(definitions)).toEqual([
    {
      groupLabelKey: 'videoEditor.templates.transitionGroupCore',
      templateKinds: ['CROSSFADE'],
    },
    {
      groupLabelKey: 'videoEditor.templates.transitionGroupReveal',
      templateKinds: ['LIGHT_SWEEP'],
    },
  ]);
});
