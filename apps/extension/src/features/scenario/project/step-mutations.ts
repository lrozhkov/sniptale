import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Removes an item by stable identity. Undo belongs to the editor transaction history. */
export function deleteScenarioStep(
  project: GuideProject,
  itemId: string,
  now = Date.now()
): {
  deletedStep: GuideProject['items'][number] | null;
  project: GuideProject;
} {
  const deletedStep = project.items.find((item) => item.id === itemId) ?? null;
  if (!deletedStep) return { deletedStep: null, project };
  return {
    deletedStep,
    project: {
      ...project,
      updatedAt: Math.max(now, project.updatedAt + 1),
      items: project.items.filter((item) => item.id !== itemId),
    },
  };
}

/** Moves a step or section within document order without changing its identity. */
export function moveScenarioStep(
  project: GuideProject,
  itemId: string,
  toIndex: number,
  now = Date.now()
): GuideProject {
  if (!Number.isInteger(toIndex)) return project;
  const fromIndex = project.items.findIndex((item) => item.id === itemId);
  if (fromIndex < 0) return project;
  const nextIndex = Math.max(0, Math.min(project.items.length - 1, toIndex));
  if (fromIndex === nextIndex) return project;
  const items = project.items.slice();
  const [item] = items.splice(fromIndex, 1);
  if (!item) return project;
  items.splice(nextIndex, 0, item);
  return { ...project, updatedAt: Math.max(now, project.updatedAt + 1), items };
}
