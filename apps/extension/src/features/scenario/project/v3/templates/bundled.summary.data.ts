import type {
  ScenarioSlideCompositionPreset,
  ScenarioSlideLayoutId,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createDefaultScenarioSlideLayout,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioShapeElement,
  createScenarioTextElement,
  DEFAULT_SCENARIO_V3_CANVAS,
} from '../factories';
import { SCENARIO_TEMPLATE_GROUPS } from './groups';

const PALETTE = {
  graphite: '#2f2a24',
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

export const BUNDLED_SCENARIO_SUMMARY_TEMPLATE_DEFINITIONS = [
  defineTemplate({
    catalogRank: 0,
    catalogStatus: 'core',
    description: 'Closing slide with three concise outcomes',
    group: SCENARIO_TEMPLATE_GROUPS.summary,
    label: 'Summary',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#fbf7ef', kind: 'solid' } },
      elements: [
        createScenarioTextElement({
          frame: { height: 70, width: 900, x: 104, y: 82 },
          role: 'title',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 42, fontWeight: 760 },
          text: 'Key takeaways',
        }),
        createScenarioShapeElement({
          cornerRadius: 20,
          fillColor: PALETTE.panel,
          frame: { height: 314, width: 1000, x: 104, y: 214 },
          role: 'summary-panel',
          strokeColor: PALETTE.rule,
          stylePresetId: 'summary-panel',
        }),
        createScenarioTextElement({
          frame: { height: 228, width: 862, x: 162, y: 264 },
          role: 'summary-list',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 28, fontWeight: 560 },
          stylePresetId: 'summary-list',
          text: '1. First outcome\n2. Second outcome\n3. Next action',
        }),
      ],
      layout: layout('summary', 'summary-grid'),
      notes: '',
      title: 'Summary',
    },
    templateId: 'summary',
  }),
  defineTemplate({
    catalogRank: 0,
    catalogStatus: 'core',
    description: 'Technical slide for code with supporting explanation',
    group: SCENARIO_TEMPLATE_GROUPS.code,
    label: 'Code focus',
    slide: {
      canvas: { ...DEFAULT_SCENARIO_V3_CANVAS, background: { color: '#f4efe7', kind: 'solid' } },
      elements: [
        createScenarioTextElement({
          frame: { height: 58, width: 900, x: 96, y: 70 },
          role: 'title',
          style: { align: 'left', color: PALETTE.graphite, fontSize: 34, fontWeight: 760 },
          text: 'Code focus',
        }),
        createScenarioCodeElement({
          frame: { height: 418, width: 760, x: 96, y: 164 },
          role: 'code-block',
          stylePresetId: 'code-panel',
        }),
        createScenarioCalloutElement({
          frame: { height: 180, width: 300, x: 904, y: 214 },
          panel: {
            backgroundColor: '#eff5f7',
            borderColor: '#8ab0c5',
            borderWidth: 1.5,
            textColor: PALETTE.graphite,
          },
          role: 'code-note',
          stylePresetId: 'technical-note',
          text: 'Explain the important line or decision',
        }),
      ],
      layout: layout('code-focus', 'technical-focus'),
      notes: '',
      title: 'Code focus',
    },
    templateId: 'code-focus',
  }),
] as const satisfies readonly ScenarioTemplateDefinition[];
