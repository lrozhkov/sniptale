import { getScenarioEditingSnapshot } from '../../../composition/persistence/scenario/history';
import { listScenarioProjectSummaries } from '../../../composition/persistence/scenario/store/public';
import type { ScenarioProjectSnapshot } from '../../../composition/persistence/scenario/contracts';

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

/** Revalidates a start-page selection and returns the same editing checkpoint as direct URL loading. */
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
  const snapshot = await getScenarioEditingSnapshot(id);
  if (!snapshot) throw new Error('Scenario project is unavailable.');
  return snapshot;
}

export async function openExistingScenarioProject(
  id: string,
  enterResourceSession: (id: string) => Promise<boolean>,
  openProject: (project: ScenarioProjectSnapshot) => Promise<void>
) {
  if (!(await enterScenarioProjectSession(id, enterResourceSession))) return;
  const snapshot = await readAvailableScenarioHistory(id);
  await openProject(snapshot);
}
