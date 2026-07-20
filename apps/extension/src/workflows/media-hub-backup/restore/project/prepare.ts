import { getVideoProject } from '../../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../../composition/persistence/projects/contracts';
import { getScenarioProjectEntry } from '../../../../composition/persistence/scenario/projects/project';
import type { VideoProject } from '../../../../features/video/project/types/model';
import type { VideoProjectEffectSnapshot } from '../../../../features/video/project/effect-instance/types';
import type {
  MediaHubBackupMetadata,
  MediaHubImportConflictStrategy,
  ScenarioBackupProjectDescriptor,
  VideoBackupProjectDescriptor,
} from '../../contracts/types';
import {
  collectScenarioAssetIds,
  collectScenarioStepIds,
  collectVideoProjectAssetIds,
  collectVideoProjectRecordingIds,
  createIdMap,
} from './ids';
import {
  assertReplaceCanOwnScenarioChildConflicts,
  assertReplaceCanOwnVideoChildConflicts,
  collectExistingVideoProjectAssetIds,
  createScenarioChildConflicts,
  createVideoChildConflicts,
  hasScenarioChildConflict,
  hasVideoChildConflict,
  type ScenarioChildConflicts,
  type VideoChildConflicts,
} from './conflicts';
import { assertSupportedScenarioBackupProjectEntry } from '../../metadata/scenario-project-version';
import { prepareEffectBundles, type PreparedEffectBundle } from './prepare-effect-bundles';

export interface PreparedVideoProject {
  descriptor: VideoBackupProjectDescriptor;
  projectAssetIdMap: ReadonlyMap<string, string>;
  projectExportIdMap: ReadonlyMap<string, string>;
  projectId: string;
  idChanged: boolean;
  recordingIdMap: ReadonlyMap<string, string>;
  restoredEffectSnapshots?: VideoProjectEffectSnapshot[];
  replace?: boolean;
}

export interface PreparedScenarioProject {
  descriptor: ScenarioBackupProjectDescriptor;
  projectId: string;
  idChanged: boolean;
  replace?: boolean;
  scenarioAssetIdMap: ReadonlyMap<string, string>;
  scenarioExportIdMap: ReadonlyMap<string, string>;
  stepIdMap: ReadonlyMap<string, string>;
}

interface PreparedProjectSet<T> {
  changedIds: string[];
  conflictsResolved: number;
  prepared: T[];
  skipped: number;
}

interface PrepareProjectArgs {
  metadata: MediaHubBackupMetadata;
  strategy: MediaHubImportConflictStrategy;
}

export interface PreparedProjectDomains {
  changedIds: string[];
  conflictsResolved: number;
  effectBundles: PreparedEffectBundle[];
  scenarioProjects: PreparedScenarioProject[];
  skipped: number;
  restoredBlobs?: ReadonlyMap<string, Blob>;
  videoProjects: PreparedVideoProject[];
}

export async function prepareProjectDomains(
  args: PrepareProjectArgs
): Promise<PreparedProjectDomains> {
  const videoProjects = await prepareVideoProjects(args);
  const scenarioProjects = await prepareScenarioProjects(args);
  const effectBundles = await prepareEffectBundles(args);

  return {
    changedIds: [
      ...videoProjects.changedIds,
      ...scenarioProjects.changedIds,
      ...effectBundles.changedIds,
    ],
    conflictsResolved:
      videoProjects.conflictsResolved +
      scenarioProjects.conflictsResolved +
      effectBundles.conflictsResolved,
    effectBundles: effectBundles.prepared,
    scenarioProjects: scenarioProjects.prepared,
    skipped: videoProjects.skipped + scenarioProjects.skipped + effectBundles.skipped,
    videoProjects: videoProjects.prepared,
  };
}

async function prepareVideoProjects(
  args: PrepareProjectArgs
): Promise<PreparedProjectSet<PreparedVideoProject>> {
  const prepared: PreparedVideoProject[] = [];
  const changedIds: string[] = [];
  let conflictsResolved = 0;
  let skipped = 0;

  for (const descriptor of args.metadata.videoProjects ?? []) {
    const existingResult = await getVideoProject(descriptor.entry.id);
    const existing = resolveVideoProjectReadResult(existingResult);
    const childConflicts = await loadVideoProjectChildConflicts(descriptor);
    const hasConflict = !!existing || hasVideoChildConflict(childConflicts);
    if (hasConflict && args.strategy === 'skip') {
      skipped += 1;
      continue;
    }
    assertReplaceCanOwnVideoChildConflicts(
      args.strategy,
      descriptor.entry.id,
      childConflicts,
      collectExistingVideoProjectAssetIds(existing)
    );

    const nextProject = createPreparedVideoProject(
      descriptor,
      childConflicts,
      existing,
      args.strategy
    );
    prepared.push(nextProject);
    changedIds.push(`video-project:${nextProject.projectId}`);
    if (existing) {
      conflictsResolved += 1;
    }
  }

  return { changedIds, conflictsResolved, prepared, skipped };
}

function createPreparedVideoProject(
  descriptor: VideoBackupProjectDescriptor,
  childConflicts: VideoChildConflicts,
  existing: VideoProject | null | undefined,
  strategy: MediaHubImportConflictStrategy
): PreparedVideoProject {
  const projectId =
    existing && strategy === 'duplicate' ? crypto.randomUUID() : descriptor.entry.id;
  const idChanged = projectId !== descriptor.entry.id;
  return {
    descriptor,
    projectAssetIdMap: createIdMap(
      collectVideoProjectAssetIds(descriptor),
      idChanged,
      childConflicts.projectAssetIds.ids
    ),
    projectExportIdMap: createIdMap(
      descriptor.projectExports.map((entry) => entry.entry.id),
      idChanged,
      childConflicts.projectExportIds.ids
    ),
    projectId,
    idChanged,
    recordingIdMap: createIdMap(
      collectVideoProjectRecordingIds(descriptor),
      idChanged,
      childConflicts.recordingIds.ids
    ),
    replace: !!existing && strategy === 'replace',
  };
}

async function prepareScenarioProjects(
  args: PrepareProjectArgs
): Promise<PreparedProjectSet<PreparedScenarioProject>> {
  const prepared: PreparedScenarioProject[] = [];
  const changedIds: string[] = [];
  let conflictsResolved = 0;
  let skipped = 0;

  for (const descriptor of args.metadata.scenarioProjects ?? []) {
    assertSupportedScenarioBackupProjectEntry(descriptor.entry);
    const existing = await getScenarioProjectEntry(descriptor.entry.id);
    const childConflicts = await loadScenarioProjectChildConflicts(descriptor);
    const hasConflict = !!existing || hasScenarioChildConflict(childConflicts);
    if (hasConflict && args.strategy === 'skip') {
      skipped += 1;
      continue;
    }
    assertReplaceCanOwnScenarioChildConflicts(args.strategy, descriptor.entry.id, childConflicts);

    const nextProject = createPreparedScenarioProject(
      descriptor,
      childConflicts,
      existing,
      args.strategy
    );
    prepared.push(nextProject);
    changedIds.push(`scenario:${nextProject.projectId}`);
    if (existing) {
      conflictsResolved += 1;
    }
  }

  return { changedIds, conflictsResolved, prepared, skipped };
}

function createPreparedScenarioProject(
  descriptor: ScenarioBackupProjectDescriptor,
  childConflicts: ScenarioChildConflicts,
  existing: unknown,
  strategy: MediaHubImportConflictStrategy
): PreparedScenarioProject {
  const projectId =
    existing && strategy === 'duplicate' ? crypto.randomUUID() : descriptor.entry.id;
  const idChanged = projectId !== descriptor.entry.id;
  return {
    descriptor,
    idChanged,
    projectId,
    replace: !!existing && strategy === 'replace',
    scenarioAssetIdMap: createIdMap(
      collectScenarioAssetIds(descriptor),
      idChanged,
      childConflicts.scenarioAssetIds.ids
    ),
    scenarioExportIdMap: createIdMap(
      descriptor.exports.map((entry) => entry.id),
      idChanged,
      childConflicts.scenarioExportIds.ids
    ),
    stepIdMap: createIdMap(
      collectScenarioStepIds(descriptor),
      idChanged,
      childConflicts.stepIds.ids
    ),
  };
}

async function loadVideoProjectChildConflicts(
  descriptor: VideoBackupProjectDescriptor
): Promise<VideoChildConflicts> {
  return createVideoChildConflicts({
    projectAssetIds: collectVideoProjectAssetIds(descriptor),
    projectExportIds: descriptor.projectExports.map((entry) => entry.entry.id),
    recordingIds: collectVideoProjectRecordingIds(descriptor),
  });
}

async function loadScenarioProjectChildConflicts(
  descriptor: ScenarioBackupProjectDescriptor
): Promise<ScenarioChildConflicts> {
  return createScenarioChildConflicts({
    scenarioAssetIds: collectScenarioAssetIds(descriptor),
    scenarioExportIds: descriptor.exports.map((entry) => entry.id),
    stepIds: collectScenarioStepIds(descriptor),
  });
}
