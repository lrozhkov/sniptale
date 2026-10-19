import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourObjectNarration } from '@sniptale/runtime-contracts/scenario/types/tour';

export interface ScenarioNarrationText {
  slideId: string;
  objectId: string;
  text: string;
  narration: TourObjectNarration | null;
}

/** Lists nonempty action texts in authored slide and action order without changing source text. */
export function listScenarioNarrationTexts(project: GuideProject): ScenarioNarrationText[] {
  if (project.purpose === 'step-template') return [];
  return (
    project.tour?.slides.flatMap((slide) =>
      slide.kind === 'image'
        ? slide.actions.flatMap(({ object }) =>
            object.text.trim()
              ? [
                  {
                    slideId: slide.id,
                    objectId: object.id,
                    text: object.text,
                    narration: object.narration ?? null,
                  },
                ]
              : []
          )
        : []
    ) ?? []
  );
}

/** Resolves only the exact eligible action; containers and labels cannot substitute for its text. */
export function getScenarioNarrationText(
  project: GuideProject,
  target: { slideId: string; objectId: string }
): ScenarioNarrationText | null {
  return (
    listScenarioNarrationTexts(project).find(
      (entry) => entry.slideId === target.slideId && entry.objectId === target.objectId
    ) ?? null
  );
}
