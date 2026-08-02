import { createScenarioSlide, createScenarioV3Id } from '../../features/scenario/project/v3';
import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { moveScenarioSlideByDirection } from './slide-rail';
import type { ScenarioCanvasElementPatch } from '../canvas';
import type { ScenarioInspectorElementPatch, ScenarioInspectorSlidePatch } from '../inspector';
import { clampElementPatch, clampSlidePatch } from './mutation-constraints';

export type ScenarioV3ElementPatch = ScenarioCanvasElementPatch & ScenarioInspectorElementPatch;

export function addProjectSlide(project: ScenarioProjectV3): ScenarioProjectV3 {
  const slide = createScenarioSlide({ title: `Slide ${project.slides.length + 1}` });
  return appendProjectSlide(project, slide);
}

function appendProjectSlide(project: ScenarioProjectV3, slide: ScenarioSlide): ScenarioProjectV3 {
  return touchProject({
    ...project,
    slides: [...project.slides, slide],
  });
}

export function deleteProjectSlide(project: ScenarioProjectV3, slideId: string): ScenarioProjectV3 {
  if (project.slides.length <= 1) {
    return project;
  }

  const index = project.slides.findIndex((slide) => slide.id === slideId);
  const slide = project.slides[index];
  if (index < 0 || !slide) {
    return project;
  }

  return touchProject({
    ...project,
    slides: project.slides.filter((candidate) => candidate.id !== slideId),
    trash: [{ deletedAt: Date.now(), originalIndex: index, slide }, ...project.trash],
  });
}

export function duplicateProjectSlide(
  project: ScenarioProjectV3,
  slideId: string
): ScenarioProjectV3 {
  const index = project.slides.findIndex((slide) => slide.id === slideId);
  const slide = project.slides[index];
  if (index < 0 || !slide) {
    return project;
  }

  const duplicate = cloneSlide(slide);
  return touchProject({
    ...project,
    slides: [...project.slides.slice(0, index + 1), duplicate, ...project.slides.slice(index + 1)],
  });
}

export function moveProjectSlide(
  project: ScenarioProjectV3,
  slideId: string,
  direction: 'down' | 'up'
): ScenarioProjectV3 {
  const slides = moveScenarioSlideByDirection({ direction, slideId, slides: project.slides });
  return slides === project.slides ? project : touchProject({ ...project, slides });
}

export function addSlideElement(
  project: ScenarioProjectV3,
  slideId: string,
  element: ScenarioElement
): ScenarioProjectV3 {
  return updateProjectSlide(project, slideId, (slide) => ({
    ...slide,
    elements: [...slide.elements, element],
  }));
}

export function deleteSlideElement(
  project: ScenarioProjectV3,
  slideId: string,
  elementId: string
): ScenarioProjectV3 {
  return updateProjectSlide(project, slideId, (slide) => {
    const elements = deleteElementById(slide.elements, elementId);
    return elements === slide.elements ? slide : { ...slide, elements };
  });
}

export function updateSlideElement(
  project: ScenarioProjectV3,
  slideId: string,
  elementId: string,
  patch: ScenarioV3ElementPatch
): ScenarioProjectV3 {
  return updateProjectSlide(project, slideId, (slide) => {
    const elements = updateElementById(slide.elements, elementId, patch);
    return elements === slide.elements ? slide : { ...slide, elements };
  });
}

export function updateSlideSettings(
  project: ScenarioProjectV3,
  slideId: string,
  patch: ScenarioInspectorSlidePatch
): ScenarioProjectV3 {
  const { canvas, clicks, ...slidePatch } = clampSlidePatch(patch);
  return updateProjectSlide(project, slideId, (slide) => ({
    ...slide,
    ...slidePatch,
    canvas: canvas ? { ...slide.canvas, ...canvas } : slide.canvas,
    clicks: clicks ? { ...slide.clicks, ...clicks } : slide.clicks,
  }));
}

export function replaceProjectSlide(
  project: ScenarioProjectV3,
  slideId: string,
  nextSlide: ScenarioSlide
): ScenarioProjectV3 {
  return updateProjectSlide(project, slideId, () => nextSlide);
}

function applyElementPatch(element: ScenarioElement, patch: ScenarioV3ElementPatch) {
  const normalizedPatch = clampElementPatch(element, patch);
  const {
    animation: _animation,
    build: _build,
    contentTransform: _contentTransform,
    frame: _frame,
    panel: _panel,
    style: _style,
    ...flatPatch
  } = normalizedPatch;
  const nextElement = {
    ...element,
    animation: normalizedPatch.animation
      ? { ...element.animation, ...normalizedPatch.animation }
      : element.animation,
    build: normalizedPatch.build ? { ...element.build, ...normalizedPatch.build } : element.build,
    ...flatPatch,
    frame: normalizedPatch.frame ? { ...element.frame, ...normalizedPatch.frame } : element.frame,
    updatedAt: Date.now(),
  } as ScenarioElement;

  if (normalizedPatch.contentTransform && 'contentTransform' in nextElement) {
    nextElement.contentTransform = {
      ...nextElement.contentTransform,
      ...normalizedPatch.contentTransform,
    };
  }
  if (normalizedPatch.panel && 'panel' in nextElement) {
    nextElement.panel = { ...nextElement.panel, ...normalizedPatch.panel };
  }
  if (normalizedPatch.style && 'style' in nextElement) {
    nextElement.style = { ...nextElement.style, ...normalizedPatch.style };
  }

  return nextElement;
}

function cloneSlide(slide: ScenarioSlide): ScenarioSlide {
  const now = Date.now();
  return {
    ...slide,
    createdAt: now,
    elements: slide.elements.map(cloneElement),
    id: createScenarioV3Id('slide'),
    title: `${slide.title || 'Untitled slide'} copy`,
    updatedAt: now,
  };
}

function cloneElement(element: ScenarioElement): ScenarioElement {
  return {
    ...element,
    id: createScenarioV3Id('element'),
  } as ScenarioElement;
}

function deleteElementById(elements: ScenarioElement[], elementId: string) {
  if (!elements.some((element) => element.id === elementId)) {
    return elements;
  }

  return elements.filter((element) => element.id !== elementId);
}

function updateElementById(
  elements: ScenarioElement[],
  elementId: string,
  patch: ScenarioV3ElementPatch
) {
  let changed = false;
  const nextElements = elements.map((element) => {
    if (element.id !== elementId) {
      return element;
    }

    changed = true;
    return applyElementPatch(element, patch);
  });

  return changed ? nextElements : elements;
}

function touchProject(project: ScenarioProjectV3): ScenarioProjectV3 {
  return {
    ...project,
    updatedAt: Date.now(),
  };
}

function updateProjectSlide(
  project: ScenarioProjectV3,
  slideId: string,
  updateSlide: (slide: ScenarioSlide) => ScenarioSlide
): ScenarioProjectV3 {
  let changed = false;
  const slides = project.slides.map((slide) => {
    if (slide.id !== slideId) {
      return slide;
    }

    const nextSlide = updateSlide(slide);
    changed = !Object.is(nextSlide, slide);
    return changed ? { ...nextSlide, updatedAt: Date.now() } : slide;
  });

  if (!changed) {
    return project;
  }

  return touchProject({
    ...project,
    slides,
  });
}
