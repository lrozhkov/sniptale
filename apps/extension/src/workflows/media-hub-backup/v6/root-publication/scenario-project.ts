import { appendCommittedArchiveRootInTransaction } from '../../../../composition/persistence/assets';
import {
  ASSET_OPERATIONS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import {
  parseScenarioAssetEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { parsePortableScenarioProjectMetadata } from '../root-codecs/projects';
import type { ArchiveRootPublisher } from '../restore';
import { scenarioAssetRestoreKey } from '../reference-keys';
import { prepareScenarioProjectPublication } from './scenario-project-publication';
import { commitScenarioProjectPublication } from './scenario-project-commit';

export const scenarioProjectRootPublisher: ArchiveRootPublisher = {
  profile: 'scenario-project',
  async checkpointSkipIfExisting({ envelope, session }) {
    const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE, ASSET_OPERATIONS_STORE],
        'readwrite'
      );
      const existingProject = parseScenarioProjectEntry(
        await tx.objectStore(SCENARIO_PROJECTS_STORE).get(metadata.entry.id)
      );
      if (!existingProject || existingProject.id !== metadata.entry.id) {
        await tx.done;
        return false;
      }
      const childIds: Record<string, string> = {};
      for (const item of metadata.assets) {
        const existing = parseScenarioAssetEntry(
          await tx.objectStore(SCENARIO_ASSETS_STORE).get(item.entry.id)
        );
        if (existing?.projectId === metadata.entry.id) {
          childIds[scenarioAssetRestoreKey(item.entry.id)] = existing.id;
        }
      }
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        {
          rootKey: `scenario-project:${envelope.descriptor.rootId}`,
          targetRootId: metadata.entry.id,
          imported: false,
          conflicted: true,
          childIds,
        }
      );
      await tx.done;
      return true;
    });
  },
  async publish({ envelope, session, staged }) {
    const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
    const sourceExists = await runWithIndexedDbMutation(async (db) =>
      Boolean(await db.get(SCENARIO_PROJECTS_STORE, metadata.entry.id))
    );
    const prepared = await prepareScenarioProjectPublication({
      metadata,
      rootId: envelope.descriptor.rootId,
      session,
      sourceExists,
      staged,
    });
    return commitScenarioProjectPublication(prepared, session);
  },
};
