import type { EditorDocument } from '../../../../../features/editor/document/types';
import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
} from '../../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../infrastructure/indexed-db/mutation';
import { createScenarioProjectEntry } from '../../projects/entry';
import { parseScenarioProjectEntry } from '../../read-guards';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import type { ScenarioAssetEntry as DbScenarioAssetEntry } from '../../contracts';

function assertScenarioCaptureBaseRevision(args: {
  baseUpdatedAt: number;
  existing: ReturnType<typeof parseScenarioProjectEntry> | undefined;
  projectId: string;
}): void {
  if (!args.existing || args.existing.project.updatedAt !== args.baseUpdatedAt) {
    throw new Error(`Scenario project ${args.projectId} was changed before this save completed`);
  }
}

export async function persistScenarioCaptureArtifacts(args: {
  assetEntry: DbScenarioAssetEntry;
  baseUpdatedAt: number;
  project: ScenarioProject;
  projectId: string;
  stepId: string;
  stepDocument: EditorDocument | null;
}): Promise<ScenarioProject> {
  return runWithIndexedDbMutation(async (db) => {
    const storeNames = [SCENARIO_ASSETS_STORE, SCENARIO_PROJECTS_STORE];
    if (args.stepDocument) {
      storeNames.push(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE);
    }

    const tx = db.transaction(storeNames, 'readwrite');
    const projectStore = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const existing =
      parseScenarioProjectEntry(await projectStore.get(args.project.id)) ?? undefined;
    assertScenarioCaptureBaseRevision({
      baseUpdatedAt: args.baseUpdatedAt,
      existing,
      projectId: args.project.id,
    });
    const projectEntry = createScenarioProjectEntry({ existing, project: args.project });

    await tx.objectStore(SCENARIO_ASSETS_STORE).put(args.assetEntry);
    await projectStore.put(projectEntry);

    if (args.stepDocument) {
      await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).put({
        stepId: args.stepId,
        projectId: args.projectId,
        document: args.stepDocument,
        createdAt: projectEntry.project.updatedAt,
        updatedAt: projectEntry.project.updatedAt,
      });
    }

    await tx.done;
    return projectEntry.project;
  });
}
