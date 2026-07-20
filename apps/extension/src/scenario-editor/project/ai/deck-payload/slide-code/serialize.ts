import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  compactScenarioAiText,
  redactScenarioAiUrl,
} from '../../../../../features/ai/scenario-redaction';

export interface ScenarioAiSlideCode {
  backgroundTransition: ScenarioSlide['backgroundTransition'];
  canvas: ScenarioSlide['canvas'];
  clicks: ScenarioSlide['clicks'];
  elements: ScenarioAiSerializedElement[];
  guide: ScenarioSlide['guide'];
  id: string;
  layout: ScenarioSlide['layout'];
  notes: string;
  projectPresentation?: ScenarioProjectV3['presentation'];
  source: ReturnType<typeof serializeScenarioSlideSource>;
  templateId: string | null;
  title: string;
  transition: ScenarioSlide['transition'];
}

export type ScenarioAiSerializedElement = ReturnType<typeof serializeScenarioAiElement>;

export function serializeScenarioAiSlideCode(args: {
  project?: ScenarioProjectV3;
  slide: ScenarioSlide;
}): ScenarioAiSlideCode {
  return {
    backgroundTransition: args.slide.backgroundTransition,
    canvas: args.slide.canvas,
    clicks: args.slide.clicks,
    elements: args.slide.elements.map(serializeScenarioAiElement),
    guide: args.slide.guide,
    id: args.slide.id,
    layout: args.slide.layout,
    notes: args.slide.notes,
    ...(args.project ? { projectPresentation: args.project.presentation } : {}),
    source: serializeScenarioSlideSource(args.slide),
    templateId: args.slide.templateId,
    title: args.slide.title,
    transition: args.slide.transition,
  };
}

export function stringifyScenarioAiSlideCode(args: {
  project?: ScenarioProjectV3;
  slide: ScenarioSlide;
}) {
  return JSON.stringify(serializeScenarioAiSlideCode(args));
}

function serializeScenarioAiElement(element: ScenarioElement) {
  const base = createSerializedElementBase(element);

  if (element.kind === 'image') {
    return serializeImageElement(base, element);
  }
  if (element.kind === 'text') {
    return { ...base, style: element.style, text: element.text };
  }
  if (element.kind === 'code') {
    return { ...base, code: element.code, language: element.language, style: element.style };
  }
  if (element.kind === 'shape') {
    return serializeShapeElement(base, element);
  }
  if (element.kind === 'callout') {
    return { ...base, connector: element.connector, panel: element.panel, text: element.text };
  }

  return {
    ...base,
    dash: element.dash,
    end: element.end,
    head: element.kind === 'arrow' ? element.head : undefined,
    start: element.start,
    strokeColor: element.strokeColor,
    strokeWidth: element.strokeWidth,
  };
}

function serializeImageElement(
  base: ReturnType<typeof createSerializedElementBase>,
  element: Extract<ScenarioElement, { kind: 'image' }>
) {
  return {
    ...base,
    assetRef: element.assetRef,
    captureContext: element.captureContext
      ? {
          page: {
            title: compactScenarioAiText(element.captureContext.page.title),
            url: redactScenarioAiUrl(element.captureContext.page.url),
          },
          target: {
            ariaLabel: compactScenarioAiText(element.captureContext.target?.ariaLabel),
            role: element.captureContext.target?.role ?? null,
            tagName: element.captureContext.target?.tagName ?? null,
            text: compactScenarioAiText(element.captureContext.target?.text),
          },
        }
      : null,
    contentTransform: element.contentTransform,
    editDocumentPresent: element.editDocumentId !== null,
    fit: element.fit,
  };
}

function serializeScenarioSlideSource(slide: ScenarioSlide) {
  if (slide.source.kind === 'manual') {
    return slide.source;
  }

  return {
    assetId: slide.source.assetId,
    captureMetadata: slide.source.captureMetadata,
    captureSurface: slide.source.captureSurface,
    cursorPoint: slide.source.cursorPoint,
    galleryAssetId: slide.source.galleryAssetId,
    interactionPoint: slide.source.interactionPoint,
    kind: slide.source.kind,
    page: {
      title: compactScenarioAiText(slide.source.page.title),
      url: redactScenarioAiUrl(slide.source.page.url),
    },
    sourceKind: slide.source.sourceKind,
    target: {
      ariaLabel: compactScenarioAiText(slide.source.target?.ariaLabel),
      role: slide.source.target?.role ?? null,
      tagName: slide.source.target?.tagName ?? null,
      text: compactScenarioAiText(slide.source.target?.text),
    },
  };
}

function serializeShapeElement(
  base: ReturnType<typeof createSerializedElementBase>,
  element: Extract<ScenarioElement, { kind: 'shape' }>
) {
  return {
    ...base,
    cornerRadius: element.cornerRadius,
    fillColor: element.fillColor,
    shape: element.shape,
    strokeColor: element.strokeColor,
    strokeWidth: element.strokeWidth,
  };
}

function createSerializedElementBase(element: ScenarioElement) {
  return {
    animation: element.animation,
    build: element.build,
    frame: element.frame,
    id: element.id,
    kind: element.kind,
    locked: element.locked,
    name: element.name,
    opacity: element.opacity,
    role: element.role,
    visible: element.visible,
  };
}
