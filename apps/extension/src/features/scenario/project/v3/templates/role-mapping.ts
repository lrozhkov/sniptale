import type {
  ScenarioElement,
  ScenarioImageElement,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';

interface ScenarioTemplateRoleMapping {
  existingElement: ScenarioElement;
  role: string;
  templateElement: ScenarioElement;
}

const IMAGE_ROLE_FALLBACKS = new Set([
  'left-image',
  'main-image',
  'right-image',
  'screenshot',
  'screenshot-image',
]);

export function createTemplateRoleMappings(args: {
  existingElements: ScenarioElement[];
  template: ScenarioTemplateDefinition;
}): ScenarioTemplateRoleMapping[] {
  const candidates = createRoleMappingCandidates(args.existingElements);

  return args.template.slide.elements.flatMap((templateElement) => {
    const existingElement = resolveExistingElementForTemplate(templateElement, candidates);
    return existingElement
      ? [{ existingElement, role: templateElement.role!, templateElement }]
      : [];
  });
}

export function applyRoleMappingToElement(
  templateElement: ScenarioElement,
  existingElement: ScenarioElement
): ScenarioElement {
  if (templateElement.kind === 'text' && existingElement.kind === 'text') {
    return { ...templateElement, text: existingElement.text };
  }
  if (templateElement.kind === 'image' && existingElement.kind === 'image') {
    return preserveImageContent(templateElement, existingElement);
  }
  if (templateElement.kind === 'code' && existingElement.kind === 'code') {
    return { ...templateElement, code: existingElement.code, language: existingElement.language };
  }
  if (templateElement.kind === 'callout' && existingElement.kind === 'callout') {
    return { ...templateElement, text: existingElement.text };
  }

  return templateElement;
}

export function listUnmatchedExistingElementIds(args: {
  existingElements: ScenarioElement[];
  template: ScenarioTemplateDefinition;
}): string[] {
  const matchedIds = new Set(
    createTemplateRoleMappings(args).map((mapping) => mapping.existingElement.id)
  );

  return args.existingElements
    .filter((element) => !matchedIds.has(element.id))
    .map((element) => element.id);
}

function createRoleMappingCandidates(elements: ScenarioElement[]) {
  const roleMap = new Map<string, ScenarioElement>();
  const firstImage = elements.find((element) => element.kind === 'image') ?? null;

  elements.forEach((element) => {
    if (element.role) {
      roleMap.set(element.role, element);
    }
  });

  return { firstImage, roleMap };
}

function resolveExistingElementForTemplate(
  templateElement: ScenarioElement,
  candidates: ReturnType<typeof createRoleMappingCandidates>
): ScenarioElement | null {
  const role = templateElement.role;
  if (!role) {
    return null;
  }

  const exactMatch = candidates.roleMap.get(role);
  if (exactMatch?.kind === templateElement.kind) {
    return exactMatch;
  }

  if (templateElement.kind !== 'image' || !IMAGE_ROLE_FALLBACKS.has(role)) {
    return null;
  }

  for (const compatibleRole of IMAGE_ROLE_FALLBACKS) {
    const compatibleMatch = candidates.roleMap.get(compatibleRole);
    if (compatibleMatch?.kind === 'image') {
      return compatibleMatch;
    }
  }

  return candidates.firstImage?.kind === 'image' ? candidates.firstImage : null;
}

function preserveImageContent(
  templateElement: ScenarioImageElement,
  existingElement: ScenarioImageElement
): ScenarioImageElement {
  return {
    ...templateElement,
    assetRef: existingElement.assetRef,
    captureContext: existingElement.captureContext,
    contentTransform: existingElement.contentTransform,
    editDocumentId: existingElement.editDocumentId,
    fit: existingElement.fit,
  };
}
