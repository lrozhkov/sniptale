import { getScenarioProjectEntry } from './projects';
import type { ScenarioSavedVersion } from './contracts';

/** Reads committed versions; page-local unsaved content is never presented as durable history. */
export async function getScenarioSavedVersions(
  projectId: string
): Promise<{ currentRevision: number; versions: ScenarioSavedVersion[] } | null> {
  const entry = await getScenarioProjectEntry(projectId);
  if (!entry) return null;
  return {
    currentRevision: entry.workspaceRevision,
    versions: [
      {
        revision: entry.workspaceRevision,
        savedAt: entry.project.updatedAt,
        project: entry.project,
      },
      ...(entry.history ?? []).toReversed(),
    ],
  };
}
