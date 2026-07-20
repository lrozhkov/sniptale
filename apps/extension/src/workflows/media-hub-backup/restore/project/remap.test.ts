import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createLegacyScenarioProjectMetadata } from './prepare.test-support.ts';
import { createV3ScenarioMetadataWithImageAsset } from './prepare-v3.test-support.ts';
import type { PreparedScenarioProject, PreparedVideoProject } from './prepare';
import { remapScenarioProjectEntry, remapVideoProjectEntry } from './remap';

it('returns current project entries unchanged when backup ids do not need remapping', () => {
  const videoEntry = {
    createdAt: 1,
    id: 'video-1',
    project: createEmptyVideoProject('Video'),
    updatedAt: 2,
  };
  const scenarioEntry = createV3ScenarioMetadataWithImageAsset().scenarioProjects![0]!.entry;

  expect(remapVideoProjectEntry(createPreparedVideoProject(videoEntry))).toBe(videoEntry);
  expect(remapScenarioProjectEntry(createPreparedScenarioProject(scenarioEntry))).toBe(
    scenarioEntry
  );
});

it('rejects legacy scenario descriptors at remap entrypoints', () => {
  const legacyEntry = createLegacyScenarioProjectMetadata().scenarioProjects![0]!.entry;

  expect(() => remapScenarioProjectEntry(createPreparedScenarioProject(legacyEntry))).toThrow(
    /scenario project 2\./
  );
});

function createPreparedVideoProject(entry: PreparedVideoProject['descriptor']['entry']) {
  return {
    descriptor: {
      entry,
      projectAssets: [],
      projectExports: [],
    },
    idChanged: false,
    projectAssetIdMap: new Map(),
    projectExportIdMap: new Map(),
    projectId: entry.id,
    recordingIdMap: new Map(),
  } satisfies PreparedVideoProject;
}

function createPreparedScenarioProject(entry: PreparedScenarioProject['descriptor']['entry']) {
  return {
    descriptor: {
      assets: [],
      entry,
      exports: [],
      stepDocuments: [],
    },
    idChanged: false,
    projectId: entry.id,
    scenarioAssetIdMap: new Map(),
    scenarioExportIdMap: new Map(),
    stepIdMap: new Map(),
  } satisfies PreparedScenarioProject;
}
