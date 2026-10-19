import { getScenarioSavedVersions } from '../../../composition/persistence/scenario/history';
import { listScenarioProjectSummaries } from '../../../composition/persistence/scenario/store/public';
import type { ScenarioProjectSnapshot } from '../../../composition/persistence/scenario/contracts';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Carries a fixed compatibility reason without exposing stored content or parser exceptions. */
export class UnsupportedScenarioTourError extends Error {
  constructor() {
    super('Scenario tour format is unsupported.');
    this.name = 'UnsupportedScenarioTourError';
  }
}

/** Classifies compatibility from display metadata when admission cannot open the document. */
export async function assertScenarioTourSupported(id: string): Promise<void> {
  const summary = (await listScenarioProjectSummaries()).find((item) => item.id === id);
  if (summary?.lifecycle?.trashedAt === undefined && summary?.availability === 'unsupported')
    throw new UnsupportedScenarioTourError();
}

/** Preserves resource admission and explains compatibility refusals before document reads. */
export async function enterScenarioProjectSession(
  id: string,
  enterResourceSession: (id: string) => Promise<boolean>
): Promise<boolean> {
  try {
    return await enterResourceSession(id);
  } catch (error) {
    await assertScenarioTourSupported(id);
    throw error;
  }
}

/** Revalidates a start-page selection and returns the same saved history as direct URL loading. */
export async function readAvailableScenarioHistory(id: string) {
  const summary = (await listScenarioProjectSummaries()).find((item) => item.id === id);
  if (summary?.lifecycle?.trashedAt === undefined && summary?.availability === 'unsupported')
    throw new UnsupportedScenarioTourError();
  if (
    !summary ||
    summary.lifecycle?.trashedAt !== undefined ||
    summary.availability !== 'available'
  )
    throw new Error('Scenario project is unavailable.');
  const history = await getScenarioSavedVersions(id);
  const [current, ...previous] = history?.versions ?? [];
  if (!history || !current) throw new Error('Scenario project is unavailable.');
  return {
    current: { project: current.project, workspaceRevision: history.currentRevision },
    previous: previous.map((version) => version.project).reverse(),
  };
}

export async function openExistingScenarioProject(
  id: string,
  enterResourceSession: (id: string) => Promise<boolean>,
  openProject: (project: ScenarioProjectSnapshot, previous: GuideProject[]) => Promise<void>
) {
  if (!(await enterScenarioProjectSession(id, enterResourceSession))) return;
  const { current, previous } = await readAvailableScenarioHistory(id);
  await openProject(current, previous);
}
