import { expect, it } from 'vitest';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';
import { VideoOverlayTemplateKind } from '../types/index';
import {
  getVideoOverlayTemplateDefinition,
  getVideoOverlayTemplateGroups,
  getVideoOverlayTemplateSelectionOrder,
} from './registry';

it('keeps the user-facing selection order stable', () => {
  expect(getVideoOverlayTemplateSelectionOrder()).toEqual([
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
    VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
    VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
    VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
    VideoOverlayTemplateKind.TITLE_REVEAL,
    VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
    VideoOverlayTemplateKind.SECTION_DIVIDER,
    VideoOverlayTemplateKind.POINTER_LABEL,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
    VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
    VideoOverlayTemplateKind.CALLOUT_CARD,
    VideoOverlayTemplateKind.SIDE_NOTE,
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
    VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
    VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
    VideoOverlayTemplateKind.SHIMMER_LABEL,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
  ]);
});

it('keeps grouped catalog sections stable for insertion flows', () => {
  expect(getVideoOverlayTemplateGroups()).toEqual([
    {
      groupLabelKey: 'videoEditor.templates.overlayGroupLowerThirds',
      templateKinds: [
        VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
        VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
        VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
        VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
        VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
        VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
      ],
    },
    {
      groupLabelKey: 'videoEditor.templates.overlayGroupTitles',
      templateKinds: [
        VideoOverlayTemplateKind.TITLE_REVEAL,
        VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
        VideoOverlayTemplateKind.SECTION_DIVIDER,
      ],
    },
    {
      groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
      templateKinds: [
        VideoOverlayTemplateKind.POINTER_LABEL,
        VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
        VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
        VideoOverlayTemplateKind.CALLOUT_CARD,
        VideoOverlayTemplateKind.SIDE_NOTE,
      ],
    },
    {
      groupLabelKey: 'videoEditor.templates.overlayGroupFocusSpotlight',
      templateKinds: [
        VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
        VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
      ],
    },
    {
      groupLabelKey: 'videoEditor.templates.overlayGroupSceneReveals',
      templateKinds: [
        VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
        VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
        VideoOverlayTemplateKind.SHIMMER_LABEL,
        VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
      ],
    },
  ]);
});

it('keeps scene reveal templates grouped together for inspector flows', () => {
  expect(getVideoOverlayTemplateGroups().at(-1)).toEqual({
    groupLabelKey: 'videoEditor.templates.overlayGroupSceneReveals',
    templateKinds: [
      VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
      VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
      VideoOverlayTemplateKind.SHIMMER_LABEL,
      VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    ],
  });
});

it('keeps callout templates grouped together for inspector flows', () => {
  expect(getVideoOverlayTemplateGroups()[2]).toEqual({
    groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
    templateKinds: [
      VideoOverlayTemplateKind.POINTER_LABEL,
      VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
      VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
      VideoOverlayTemplateKind.CALLOUT_CARD,
      VideoOverlayTemplateKind.SIDE_NOTE,
    ],
  });
});

it('keeps title templates grouped together for insertion flows', () => {
  expect(getVideoOverlayTemplateGroups()[1]).toEqual({
    groupLabelKey: 'videoEditor.templates.overlayGroupTitles',
    templateKinds: [
      VideoOverlayTemplateKind.TITLE_REVEAL,
      VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
      VideoOverlayTemplateKind.SECTION_DIVIDER,
    ],
  });
});

it('keeps lower thirds grouped together for insertion flows', () => {
  expect(getVideoOverlayTemplateGroups()[0]).toEqual({
    groupLabelKey: 'videoEditor.templates.overlayGroupLowerThirds',
    templateKinds: [
      VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
      VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
      VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
      VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
      VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
      VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
    ],
  });
});

it('keeps the grouped catalog count stable', () => {
  expect(getVideoOverlayTemplateGroups()).toHaveLength(5);
});

it('keeps grouped catalog order stable end-to-end', () => {
  expect(getVideoOverlayTemplateGroups().flatMap((group) => group.templateKinds)).toEqual([
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
    VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
    VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
    VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
    VideoOverlayTemplateKind.TITLE_REVEAL,
    VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
    VideoOverlayTemplateKind.SECTION_DIVIDER,
    VideoOverlayTemplateKind.POINTER_LABEL,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
    VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
    VideoOverlayTemplateKind.CALLOUT_CARD,
    VideoOverlayTemplateKind.SIDE_NOTE,
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
    VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
    VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
    VideoOverlayTemplateKind.SHIMMER_LABEL,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
  ]);
});

it('exposes label, description, and family metadata for every template', () => {
  const definition = getVideoOverlayTemplateDefinition(VideoOverlayTemplateKind.POINTER_LABEL);

  expect(definition).toEqual({
    annotationFamily: 'POINTER',
    catalogRank: 0,
    catalogStatus: VideoTemplateCatalogStatus.CORE,
    defaultDurationSeconds: 4.2,
    descriptionKey: 'videoEditor.templates.overlayDescriptionPointerLabel',
    groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
    labelKey: 'videoEditor.sidebar.annotationTemplatePointerLabel',
    layoutFamily: 'MARKER',
    motionFamily: 'MARKER_POP',
    preview: {
      motionLabelKey: 'videoEditor.templates.previewMotionFocus',
      tone: 'TECHNICAL',
      toneLabelKey: 'videoEditor.templates.previewToneTechnical',
      variant: 'CALLOUT',
    },
    renderFamily: 'MARKER',
    templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
    useCaseKey: 'videoEditor.templates.overlayUseCasePointerLabel',
  });
});
