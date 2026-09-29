import { getScenarioSavedVersions } from '../../../composition/persistence/scenario/history';
import { listScenarioProjectSummaries } from '../../../composition/persistence/scenario/store/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Revalidates a start-page selection and returns the same saved history as direct URL loading. */
export async function readAvailableScenarioHistory(id: string) {
  const summary = (await listScenarioProjectSummaries()).find((item) => item.id === id);
  if (
    !summary ||
    summary.lifecycle?.trashedAt !== undefined ||
    summary.availability !== 'available'
  )
    throw new Error('Scenario project is unavailable.');
  const history = await getScenarioSavedVersions(id);
  const [current, ...previous] = history?.versions ?? [];
  if (!current) throw new Error('Scenario project is unavailable.');
  return {
    current: current.project,
    previous: previous.map((version) => version.project).reverse(),
  };
}

export async function openExistingScenarioProject(
  id: string,
  enterResourceSession: (id: string) => Promise<boolean>,
  openProject: (project: GuideProject, previous: GuideProject[]) => Promise<void>
) {
  if (!(await enterResourceSession(id))) return;
  const { current, previous } = await readAvailableScenarioHistory(id);
  await openProject(current, previous);
}
