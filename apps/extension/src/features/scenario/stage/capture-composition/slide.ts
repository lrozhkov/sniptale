import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioPoint,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createDefaultScenarioSlideClicks,
  createDefaultScenarioSlideGuide,
  createDefaultScenarioSlideLayout,
  createScenarioSlide,
} from '../../project/v3';
import { CAPTURE_CANVAS_HEIGHT, CAPTURE_CANVAS_WIDTH } from './constants';
import {
  createPointFrame,
  getFrameCenter,
  mapViewportPointToImageFrame,
  mapViewportRectToImageFrame,
} from './geometry';
import { createCaptureLayout } from './layout';
import {
  createClickMarkerElement,
  createConnectorElement,
  createMainImageElement,
  createStepNoteElement,
  createTargetHighlightElement,
  getClickMarkerSize,
} from './overlays';
import { chooseCalloutPlacement } from './placement';
import { createCaptureCalloutText } from './text';
import type { CaptureLayout, ScenarioCaptureSlideInput } from './types';

interface CaptureSlideDraft {
  elements: ScenarioElement[];
  layout: CaptureLayout;
}

export function createScenarioCaptureSlide(input: ScenarioCaptureSlideInput): ScenarioSlide {
  const { elements, layout } = createCaptureSlideDraft(input);
  const hasGeneratedBuilds = elements.some((element) => element.build.showAtClick > 0);

  return createScenarioSlide({
    canvas: {
      background: { color: layout.slideBackgroundColor, kind: 'solid' },
      height: CAPTURE_CANVAS_HEIGHT,
      width: CAPTURE_CANVAS_WIDTH,
    },
    clicks: createDefaultScenarioSlideClicks({
      count: hasGeneratedBuilds ? 1 : 0,
      initialIndex: hasGeneratedBuilds ? 1 : 0,
    }),
    createdAt: input.now,
    elements,
    guide: createDefaultScenarioSlideGuide({
      body: input.body,
      stepNumber: input.slideIndex + 1,
      targetSummary: describeTarget(input.target),
    }),
    layout: createCaptureSlideLayout(layout.kind, elements),
    notes: input.body,
    source: createCaptureSlideSource(input),
    templateId: createCaptureTemplateId(layout.kind, elements),
    title: input.title || input.page.title || `Step ${input.slideIndex + 1}`,
    updatedAt: input.now,
  });
}

function createCaptureSlideLayout(
  kind: CaptureLayout['kind'],
  elements: ScenarioElement[]
): ScenarioSlide['layout'] {
  const layoutId = createCaptureTemplateId(kind, elements);
  return createDefaultScenarioSlideLayout({
    compositionPreset: getCaptureCompositionPreset(kind),
    layoutId,
    safeArea: { bottom: 48, left: 48, right: 48, top: 48 },
  });
}

function getCaptureCompositionPreset(kind: CaptureLayout['kind']) {
  if (kind === 'side-note-walkthrough' || kind === 'sparse-viewport') {
    return 'guided-screenshot';
  }
  if (kind === 'click-sequence' || kind === 'target-focused') {
    return 'note-grid';
  }

  return 'focus-frame';
}

function createCaptureTemplateId(
  kind: CaptureLayout['kind'],
  elements: ScenarioElement[]
): ScenarioSlide['layout']['layoutId'] {
  if (kind === 'click-sequence' || hasElementRole(elements, 'click-marker')) {
    return 'step-guide';
  }
  if (kind === 'side-note-walkthrough' || hasElementRole(elements, 'step-note')) {
    return 'screenshot-callout';
  }

  return 'screenshot-focus';
}

function hasElementRole(elements: ScenarioElement[], role: string): boolean {
  return elements.some((element) => element.role === role);
}

export function appendScenarioCaptureSlide(
  project: ScenarioProjectV3,
  slide: ScenarioSlide,
  updatedAt: number
): ScenarioProjectV3 {
  return {
    ...project,
    slides: isInitialBlankSlide(project.slides[0]) ? [slide] : [...project.slides, slide],
    updatedAt,
  };
}

function createCaptureSlideDraft(input: ScenarioCaptureSlideInput): CaptureSlideDraft {
  const layout = createCaptureLayout(input);
  const mappedTarget = mapViewportRectToImageFrame(
    input.target?.rect ?? null,
    input.page,
    layout.imageFrame,
    input.target?.framePadding ?? null
  );
  const mappedClick = mapViewportPointToImageFrame(
    input.interactionPoint,
    input.page,
    layout.imageFrame
  );
  const clickFrame = createPointFrame(mappedClick, getClickMarkerSize());
  const focusPoint = mappedClick ?? getFrameCenter(mappedTarget);
  const calloutText = createCaptureCalloutText(input.body, layout.kind);
  const placement = chooseCalloutPlacement({
    avoidFrames: [mappedTarget, clickFrame].filter(Boolean) as ScenarioElementFrame[],
    focusPoint,
    layout,
  });

  return {
    elements: createCaptureElements({
      calloutText,
      clickFrame,
      focusPoint,
      input,
      layout,
      mappedTarget,
      placement,
    }),
    layout,
  };
}

function createCaptureElements(args: {
  calloutText: string | null;
  clickFrame: ScenarioElementFrame | null;
  focusPoint: ScenarioPoint | null;
  input: ScenarioCaptureSlideInput;
  layout: ReturnType<typeof createCaptureLayout>;
  mappedTarget: ScenarioElementFrame | null;
  placement: ReturnType<typeof chooseCalloutPlacement>;
}): ScenarioElement[] {
  const image = createMainImageElement(args.input, args.layout.imageFrame);
  const sequenceConnector = createSequenceConnector(args);
  const noteConnector = createConnectorElement({
    end: args.focusPoint,
    order: 2,
    start: args.placement?.connectorStart ?? null,
  });

  return [
    image,
    createTargetHighlightElement(args.mappedTarget),
    sequenceConnector,
    noteConnector,
    createClickMarkerElement(args.clickFrame),
    createStepNoteElement({ frame: args.placement?.frame ?? null, text: args.calloutText }),
  ].filter(Boolean) as ScenarioElement[];
}

function createSequenceConnector(args: {
  input: ScenarioCaptureSlideInput;
  layout: ReturnType<typeof createCaptureLayout>;
}): ScenarioElement | null {
  const pointerRange = args.input.captureMetadata.pointerRange;
  if (args.layout.kind !== 'click-sequence' || !pointerRange) {
    return null;
  }

  return createConnectorElement({
    dash: 'dashed',
    end: mapViewportPointToImageFrame(pointerRange.end, args.input.page, args.layout.imageFrame),
    order: 2,
    start: mapViewportPointToImageFrame(
      pointerRange.start,
      args.input.page,
      args.layout.imageFrame
    ),
  });
}

function createCaptureSlideSource(input: ScenarioCaptureSlideInput): ScenarioSlide['source'] {
  return {
    assetId: input.assetRef.assetId,
    captureMetadata: input.captureMetadata,
    captureSurface: input.captureSurface,
    cursorPoint: input.cursorPoint,
    galleryAssetId: input.assetRef.galleryAssetId,
    interactionPoint: input.interactionPoint,
    kind: 'capture',
    page: input.page,
    sourceKind: input.sourceKind,
    target: input.target,
  };
}

function describeTarget(target: ScenarioCaptureSlideInput['target']): string | null {
  return target?.ariaLabel ?? target?.text ?? target?.title ?? target?.selector ?? null;
}

function isInitialBlankSlide(slide: ScenarioSlide | undefined): boolean {
  return !!slide && slide.elements.length === 0 && slide.source.kind === 'manual';
}
