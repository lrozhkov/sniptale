import { getScenarioProjectEntry } from './projects';
import { commitScenarioAggregateMutation } from './aggregate-mutations';
import { publishMediaHubLibraryChanged } from '../../../features/media-hub/events';
import type { ScenarioSavedVersion } from './contracts';

/** Reads committed versions; page-local unsaved content is never presented as durable history. */
export async function getScenarioSavedVersions(
  projectId: string
): Promise<{ currentRevision: number; versions: ScenarioSavedVersion[] }> {
  const entry = await getScenarioProjectEntry(projectId);
  if (!entry) throw new Error('Saved guide history is unavailable.');
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

/** Restores an admitted stored snapshot through a fresh CAS publication, without rewinding its revision. */
export async function restoreScenarioSavedVersion(args: {
  projectId: string;
  revision: number;
  baseUpdatedAt: number;
}) {
  const entry = await getScenarioProjectEntry(args.projectId);
  if (!entry) throw new Error('Saved guide history is unavailable.');
  const version = entry.history?.find((item) => item.revision === args.revision);
  if (!version) throw new Error('The selected saved version is unavailable.');
  const result = await commitScenarioAggregateMutation(version.project, {
    expectedUpdatedAt: args.baseUpdatedAt,
  });
  publishMediaHubLibraryChanged('update', [`scenario:${args.projectId}`]);
  return result.project;
}
