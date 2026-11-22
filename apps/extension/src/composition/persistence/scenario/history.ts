import { getScenarioProjectEntry } from './projects';
import type { ScenarioSavedVersion, ScenarioProjectSnapshot } from './contracts';
import { retainScenarioEditingHistory } from './editing-history';

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

/** Read current and exact navigation together; only legacy entries derive past from saved revisions. */
export async function getScenarioEditingSnapshot(
  projectId: string
): Promise<ScenarioProjectSnapshot | null> {
  const entry = await getScenarioProjectEntry(projectId);
  if (!entry) return null;
  return {
    project: entry.project,
    workspaceRevision: entry.workspaceRevision,
    editingHistory:
      entry.editingHistory ??
      retainScenarioEditingHistory(
        entry.project,
        (entry.history ?? []).map((version) => version.project)
      ),
  };
}
