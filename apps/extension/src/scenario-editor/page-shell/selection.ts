import type {
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3EditorSelection, ScenarioV3EditorSession } from './types';

export function createInitialEditorSession(
  project: ScenarioProjectV3,
  initialSlideId: string | null = null
): ScenarioV3EditorSession {
  const selectedSlideId = initialSlideId
    ? (project.slides.find((slide) => slide.id === initialSlideId)?.id ?? null)
    : null;

  return {
    history: {
      future: [],
      past: [],
    },
    project,
    selectedElementId: null,
    selectedSlideId: selectedSlideId ?? project.slides[0]?.id ?? null,
  };
}

export function getEditorSelection(session: ScenarioV3EditorSession): ScenarioV3EditorSelection {
  const selectedSlide = findSelectedSlide(session.project, session.selectedSlideId);
  const selectedElement =
    session.selectedElementId && selectedSlide
      ? (selectedSlide.elements.find((element) => element.id === session.selectedElementId) ?? null)
      : null;

  return {
    selectedElement,
    selectedSlide,
  };
}

function findSelectedSlide(project: ScenarioProjectV3, slideId: string | null) {
  const slide = slideId ? project.slides.find((candidate) => candidate.id === slideId) : null;
  return slide ?? project.slides[0] ?? createFallbackSlide();
}

export function keepReachableSelection(
  session: ScenarioV3EditorSession,
  nextProject: ScenarioProjectV3
) {
  const nextSlide = findSelectedSlide(nextProject, session.selectedSlideId);
  const selectedElementId = nextSlide.elements.some(
    (element) => element.id === session.selectedElementId
  )
    ? session.selectedElementId
    : null;

  return {
    selectedElementId,
    selectedSlideId: nextSlide.id,
  };
}

function createFallbackSlide(): ScenarioSlide {
  throw new Error('Scenario v3 editor requires at least one slide');
}
