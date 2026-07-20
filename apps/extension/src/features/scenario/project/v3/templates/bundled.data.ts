import type {
  ScenarioSlideCompositionPreset,
  ScenarioSlideLayoutId,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createDefaultScenarioSlideLayout,
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioTextElement,
  DEFAULT_SCENARIO_V3_CANVAS,
} from '../factories';
import { BUNDLED_SCENARIO_SUMMARY_TEMPLATE_DEFINITIONS } from './bundled.summary.data.ts';
import { SCENARIO_TEMPLATE_GROUPS } from './groups';

const PALETTE = {
  accent: '#c8652b',
  accentSoft: 'rgba(200,101,43,0.13)',
  background: '#f8f4ec',
  blue: '#2f5f89',
  graphite: '#2f2a24',
  muted: '#6f665b',
  panel: '#fffaf2',
  rule: '#d8c7b4',
} as const;

const baseDefinition = {
  source: 'bundled',
  version: 1,
} as const;

function layout(
  layoutId: ScenarioSlideLayoutId,
  compositionPreset: ScenarioSlideCompositionPreset
) {
  return createDefaultScenarioSlideLayout({
    compositionPreset,
    layoutId,
    safeArea: { bottom: 54, left: 72, right: 72, top: 54 },
  });
}

function defineTemplate(
  definition: Omit<ScenarioTemplateDefinition, 'source' | 'version'>
): ScenarioTemplateDefinition {
  return { ...baseDefinition, ...definition };
}

export const BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS = [
  defineTemplate({
    catalogRank: 0,
    catalogStatus: 'core',
    description: 'A clean canvas for custom presentation work',
    group: SCENARIO_TEMPLATE_GROUPS.section,
    label: 'Blank',
    slide: {
      canvas: {
        ...DEFAULT_SCENARIO_V3_CANVAS,
        background: { color: PALETTE.background, kind: 'solid' },
      },
      elements: [],
      layout: layout('blank', 'freeform'),
      notes: '',
      title: 'Blank',
    },
    templateId: 'blank',
  }),
  defineTemplate({
    catalogRank: 1,
    catalogStatus: 'core',
    description: 'Deck opener with strong title hierarchy',
    group: SCENARIO_TEMPLATE_GROUPS.section,
    label: 'Title',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#fbf7ef', kind: 'solid' } },
      elements: [
        createScenarioTextElement({
          frame: { height: 110, width: 900, x: 110, y: 214 },
          role: 'title',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 58, fontWeight: 760 },
          stylePresetId: 'display-title',
          text: 'Scenario title',
        }),
        createScenarioTextElement({
          frame: { height: 76, width: 760, x: 114, y: 340 },
          role: 'subtitle',
          style: { align: 'left', color: PALETTE.muted, fontSize: 26, fontWeight: 500 },
          stylePresetId: 'supporting-copy',
          text: 'Context, audience, or workflow summary',
        }),
        createScenarioLineElement({
          end: { x: 336, y: 472 },
          frame: { height: 10, width: 224, x: 112, y: 472 },
          role: 'accent-rule',
          start: { x: 112, y: 472 },
          strokeColor: PALETTE.accent,
          strokeWidth: 4,
          stylePresetId: 'accent-rule',
        }),
      ],
      layout: layout('title', 'cover'),
      notes: '',
      title: 'Title',
    },
    templateId: 'title',
  }),
  defineTemplate({
    catalogRank: 2,
    catalogStatus: 'core',
    description: 'High-contrast divider for chapters and agenda breaks',
    group: SCENARIO_TEMPLATE_GROUPS.section,
    label: 'Section divider',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#302b25', kind: 'solid' } },
      elements: [
        createScenarioTextElement({
          frame: { height: 72, width: 760, x: 116, y: 248 },
          role: 'section-kicker',
          style: { align: 'left', color: '#d9a35f', fontSize: 24, fontWeight: 700 },
          stylePresetId: 'section-kicker',
          text: 'Section 01',
        }),
        createScenarioTextElement({
          frame: { height: 110, width: 900, x: 112, y: 326 },
          role: 'section-title',
          style: { align: 'left', color: '#fff7e8', fontSize: 54, fontWeight: 760 },
          stylePresetId: 'section-title',
          text: 'Section title',
        }),
      ],
      layout: layout('section-divider', 'divider'),
      notes: '',
      title: 'Section divider',
    },
    templateId: 'section-divider',
  }),
  defineTemplate({
    catalogRank: 0,
    catalogStatus: 'core',
    description: 'Large screenshot with calm framing and minimal overlay noise',
    group: SCENARIO_TEMPLATE_GROUPS.walkthrough,
    label: 'Screenshot focus',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#f5f0e7', kind: 'solid' } },
      elements: [
        createScenarioShapeElement({
          cornerRadius: 22,
          fillColor: '#fffaf2',
          frame: { height: 500, width: 992, x: 144, y: 110 },
          role: 'screenshot-frame',
          strokeColor: PALETTE.rule,
          stylePresetId: 'screenshot-surface',
        }),
        createScenarioImageElement({
          frame: { height: 468, width: 960, x: 160, y: 126 },
          role: 'main-image',
          stylePresetId: 'main-screenshot',
        }),
      ],
      layout: layout('screenshot-focus', 'focus-frame'),
      notes: '',
      title: 'Screenshot focus',
    },
    templateId: 'screenshot-focus',
  }),
  defineTemplate({
    catalogRank: 1,
    catalogStatus: 'core',
    description: 'Screenshot with a side note and explicit target highlight',
    group: SCENARIO_TEMPLATE_GROUPS.walkthrough,
    label: 'Screenshot callout',
    slide: {
      canvas: {
        ...DEFAULT_SCENARIO_V3_CANVAS,
        background: { color: PALETTE.background, kind: 'solid' },
      },
      elements: [
        createScenarioImageElement({
          frame: { height: 456, width: 728, x: 88, y: 144 },
          role: 'main-image',
          stylePresetId: 'main-screenshot',
        }),
        createScenarioCalloutElement({
          frame: { height: 178, width: 344, x: 868, y: 220 },
          panel: {
            backgroundColor: PALETTE.panel,
            borderColor: '#d9a35f',
            borderWidth: 1.5,
            textColor: PALETTE.graphite,
          },
          role: 'step-note',
          stylePresetId: 'primary-callout',
          text: 'Describe why this screen matters',
        }),
        createScenarioArrowElement({
          end: { x: 746, y: 322 },
          frame: { height: 180, width: 300, x: 628, y: 250 },
          role: 'connector',
          start: { x: 868, y: 322 },
          strokeColor: PALETTE.accent,
          stylePresetId: 'callout-connector',
        }),
      ],
      layout: layout('screenshot-callout', 'guided-screenshot'),
      notes: '',
      title: 'Screenshot callout',
    },
    templateId: 'screenshot-callout',
  }),
  defineTemplate({
    catalogRank: 2,
    catalogStatus: 'core',
    description: 'Click-by-click walkthrough with ordered build steps',
    group: SCENARIO_TEMPLATE_GROUPS.walkthrough,
    label: 'Step guide',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#fbfaf6', kind: 'solid' } },
      elements: [
        createScenarioTextElement({
          frame: { height: 54, width: 780, x: 82, y: 64 },
          role: 'title',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 34, fontWeight: 760 },
          stylePresetId: 'slide-title',
          text: 'Step title',
        }),
        createScenarioImageElement({
          frame: { height: 430, width: 760, x: 82, y: 158 },
          role: 'main-image',
          stylePresetId: 'main-screenshot',
        }),
        createScenarioCalloutElement({
          build: { hideAtClick: null, order: 1, showAtClick: 1 },
          frame: { height: 148, width: 326, x: 884, y: 176 },
          role: 'step-note',
          stylePresetId: 'primary-callout',
          text: 'What changes on this click',
        }),
        createScenarioShapeElement({
          build: { hideAtClick: null, order: 2, showAtClick: 1 },
          cornerRadius: 20,
          fillColor: PALETTE.accentSoft,
          frame: { height: 58, width: 58, x: 664, y: 396 },
          role: 'click-marker',
          shape: 'ellipse',
          strokeColor: PALETTE.accent,
          strokeWidth: 3,
          stylePresetId: 'click-marker',
        }),
      ],
      layout: layout('step-guide', 'note-grid'),
      notes: '',
      title: 'Step guide',
    },
    templateId: 'step-guide',
  }),
  defineTemplate({
    catalogRank: 0,
    catalogStatus: 'core',
    description: 'Two-up comparison for before and after states',
    group: SCENARIO_TEMPLATE_GROUPS.comparison,
    label: 'Before/after',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#f7f2ea', kind: 'solid' } },
      elements: [
        createScenarioTextElement({
          frame: { height: 50, width: 430, x: 90, y: 78 },
          role: 'left-title',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 30, fontWeight: 760 },
          text: 'Before',
        }),
        createScenarioTextElement({
          frame: { height: 50, width: 430, x: 684, y: 78 },
          role: 'right-title',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 30, fontWeight: 760 },
          text: 'After',
        }),
        createScenarioImageElement({
          frame: { height: 388, width: 510, x: 90, y: 152 },
          role: 'left-image',
          stylePresetId: 'comparison-image',
        }),
        createScenarioImageElement({
          frame: { height: 388, width: 510, x: 684, y: 152 },
          role: 'right-image',
          stylePresetId: 'comparison-image',
        }),
      ],
      layout: layout('before-after', 'comparison'),
      notes: '',
      title: 'Before/after',
    },
    templateId: 'before-after',
  }),
  ...BUNDLED_SCENARIO_SUMMARY_TEMPLATE_DEFINITIONS,
] as const satisfies readonly ScenarioTemplateDefinition[];
