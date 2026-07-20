import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../features/scenario/contracts/types/project';

export type ApplyLoadedProjectOptions = {
  preserveQuickEdit?: boolean;
  preferredStepId?: string | null;
};

export function toProjectSummary(project: ScenarioProject): ScenarioProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    tags: project.tags ?? [],
  };
}

export function sortProjectSummaries(projects: ScenarioProjectSummary[]) {
  return projects.slice().sort((left, right) => right.updatedAt - left.updatedAt);
}

export function resolveSelectedStepId(
  nextProject: ScenarioProject | null,
  preferredStepId: string | null
): string | null {
  if (!nextProject || !preferredStepId) {
    return null;
  }

  return nextProject.steps.some((step) => step.id === preferredStepId) ? preferredStepId : null;
}
