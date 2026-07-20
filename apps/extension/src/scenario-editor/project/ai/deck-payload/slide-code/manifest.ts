import { listBundledScenarioTemplates } from '../../../../../features/scenario/project/v3/templates';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';

export interface ScenarioAiToolManifest {
  canvas: {
    coordinateSystem: 'slide-pixels';
    minHeight: number;
    minWidth: number;
  };
  elementKinds: string[];
  operations: string[];
  templates: Array<{
    group: string;
    id: string;
    label: string;
    source: ScenarioTemplateDefinition['source'];
  }>;
}

export function createScenarioAiToolManifest(
  args: {
    templates?: readonly ScenarioTemplateDefinition[];
  } = {}
): ScenarioAiToolManifest {
  const templates = args.templates ?? listBundledScenarioTemplates();

  return {
    canvas: {
      coordinateSystem: 'slide-pixels',
      minHeight: 240,
      minWidth: 320,
    },
    elementKinds: Object.values(SCENARIO_V3_ELEMENT_KINDS),
    operations: [
      'setProjectPresentation',
      'setSlideTitle',
      'setSlideNotes',
      'setSlideCanvas',
      'setSlideLayout',
      'setSlideTemplate',
      'setSlideTransition',
      'setSlideBackgroundTransition',
      'setSlideClicks',
      'addElement',
      'updateElement',
      'deleteElement',
      'reorderElement',
      'setElementBuild',
      'setElementAnimation',
      'editImageTransform',
    ],
    templates: templates.map((template) => ({
      group: template.group,
      id: template.templateId,
      label: template.label,
      source: template.source,
    })),
  };
}
