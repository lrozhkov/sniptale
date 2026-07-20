import {
  createDefaultScenarioSlideLayout,
  createScenarioSlide,
  createScenarioV3Id,
} from '../factories';
import type {
  ScenarioElement,
  ScenarioSlide,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  applyRoleMappingToElement,
  createTemplateRoleMappings,
  listUnmatchedExistingElementIds,
} from './role-mapping';

export interface ScenarioTemplateApplicationPlan {
  preservedRoles: string[];
  removedElementIds: string[];
  requiresConfirmation: boolean;
  templateId: string;
}

export type ScenarioTemplateApplyResult =
  | {
      plan: ScenarioTemplateApplicationPlan;
      slide: ScenarioSlide;
      status: 'applied';
    }
  | {
      plan: ScenarioTemplateApplicationPlan;
      status: 'needs-confirmation';
    };

export function instantiateScenarioTemplateSlide(
  template: ScenarioTemplateDefinition
): ScenarioSlide {
  return createScenarioSlide({
    canvas: template.slide.canvas,
    elements: template.slide.elements.map(cloneTemplateElement),
    layout: createDefaultScenarioSlideLayout(template.slide.layout),
    notes: template.slide.notes,
    templateId: template.templateId,
    title: template.slide.title,
  });
}

export function planScenarioTemplateApplication(args: {
  slide: ScenarioSlide;
  template: ScenarioTemplateDefinition;
}): ScenarioTemplateApplicationPlan {
  const mappings = createTemplateRoleMappings({
    existingElements: args.slide.elements,
    template: args.template,
  });
  const removedElementIds = listUnmatchedExistingElementIds({
    existingElements: args.slide.elements,
    template: args.template,
  });

  return {
    preservedRoles: mappings.map((mapping) => mapping.role),
    removedElementIds,
    requiresConfirmation: removedElementIds.length > 0,
    templateId: args.template.templateId,
  };
}

export function applyScenarioTemplateToSlide(args: {
  confirmed: boolean;
  slide: ScenarioSlide;
  template: ScenarioTemplateDefinition;
}): ScenarioTemplateApplyResult {
  const plan = planScenarioTemplateApplication(args);
  if (plan.requiresConfirmation && !args.confirmed) {
    return { plan, status: 'needs-confirmation' };
  }

  return {
    plan,
    slide: {
      ...args.slide,
      canvas: args.template.slide.canvas,
      elements: instantiateTemplateElements(args),
      layout: createDefaultScenarioSlideLayout(args.template.slide.layout),
      notes: args.slide.notes || args.template.slide.notes,
      templateId: args.template.templateId,
      title: args.template.slide.title,
      updatedAt: Date.now(),
    },
    status: 'applied',
  };
}

function instantiateTemplateElements(args: {
  slide: ScenarioSlide;
  template: ScenarioTemplateDefinition;
}) {
  const existingByTemplateElementId = new Map(
    createTemplateRoleMappings({
      existingElements: args.slide.elements,
      template: args.template,
    }).map((mapping) => [mapping.templateElement.id, mapping.existingElement])
  );

  return args.template.slide.elements.map((templateElement) => {
    const existingElement = existingByTemplateElementId.get(templateElement.id) ?? null;
    const clonedElement = cloneTemplateElement(templateElement);
    return existingElement
      ? applyRoleMappingToElement(clonedElement, existingElement)
      : clonedElement;
  });
}

function cloneTemplateElement(element: ScenarioElement): ScenarioElement {
  return {
    ...element,
    id: createScenarioV3Id('element'),
    stylePresetId: element.stylePresetId ?? null,
  } as ScenarioElement;
}
