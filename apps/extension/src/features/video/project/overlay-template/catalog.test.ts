import { expect, it } from 'vitest';
import {
  buildVideoOverlayTemplateGroups,
  buildVideoOverlayTemplateSelectionOrder,
} from './catalog';
import type { VideoOverlayTemplateDefinition } from './definition';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';

const SHARED_PREVIEW = {
  motionLabelKey: 'videoEditor.templates.previewMotionReveal',
  tone: 'CALM',
  toneLabelKey: 'videoEditor.templates.previewToneCalm',
  variant: 'CALLOUT',
} as const;

function createDefinition(
  partial: Pick<
    VideoOverlayTemplateDefinition,
    | 'annotationFamily'
    | 'catalogRank'
    | 'catalogStatus'
    | 'groupLabelKey'
    | 'labelKey'
    | 'layoutFamily'
    | 'motionFamily'
    | 'renderFamily'
    | 'templateKind'
  >
): VideoOverlayTemplateDefinition {
  return {
    ...partial,
    defaultDurationSeconds: 5,
    descriptionKey: 'videoEditor.templates.overlayDescriptionLowerThirdBasic',
    preview: SHARED_PREVIEW,
    useCaseKey: 'videoEditor.templates.overlayUseCaseLowerThirdBasic',
  };
}

function createCatalogDefinitions() {
  return [
    createDefinition({
      annotationFamily: 'CALLOUT',
      catalogRank: 2,
      catalogStatus: VideoTemplateCatalogStatus.LEGACY,
      groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
      labelKey: 'videoEditor.sidebar.annotationTemplateCalloutCard',
      layoutFamily: 'RAIL_CARD',
      motionFamily: 'SLIDE_CARD',
      renderFamily: 'PLATE',
      templateKind: 'CALLOUT_CARD',
    }),
    createDefinition({
      annotationFamily: 'POINTER',
      catalogRank: 0,
      catalogStatus: VideoTemplateCatalogStatus.CORE,
      groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
      labelKey: 'videoEditor.sidebar.annotationTemplatePointerLabel',
      layoutFamily: 'MARKER',
      motionFamily: 'MARKER_POP',
      renderFamily: 'MARKER',
      templateKind: 'POINTER_LABEL',
    }),
    createDefinition({
      annotationFamily: 'CALLOUT',
      catalogRank: 1,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
      labelKey: 'videoEditor.sidebar.annotationTemplateCalloutConnector',
      layoutFamily: 'CONNECTOR',
      motionFamily: 'CONNECTOR_DRAW',
      renderFamily: 'LINE',
      templateKind: 'CALLOUT_CONNECTOR',
    }),
  ] as const satisfies readonly VideoOverlayTemplateDefinition[];
}

it('prioritizes core templates ahead of optional and legacy entries inside each catalog group', () => {
  const definitions = createCatalogDefinitions();

  expect(buildVideoOverlayTemplateSelectionOrder(definitions)).toEqual([
    'POINTER_LABEL',
    'CALLOUT_CONNECTOR',
    'CALLOUT_CARD',
  ]);
  expect(buildVideoOverlayTemplateSelectionOrder(definitions.slice(0, 2))).toEqual([
    'POINTER_LABEL',
    'CALLOUT_CARD',
  ]);
  expect(buildVideoOverlayTemplateGroups(definitions)).toEqual([
    {
      groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
      templateKinds: ['POINTER_LABEL', 'CALLOUT_CONNECTOR', 'CALLOUT_CARD'],
    },
  ]);
});
