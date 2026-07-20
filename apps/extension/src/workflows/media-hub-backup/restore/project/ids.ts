import { isScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import type {
  ScenarioBackupProjectDescriptor,
  VideoBackupProjectDescriptor,
} from '../../contracts/types';
import { assertSupportedScenarioBackupProjectEntry } from '../../metadata/scenario-project-version';

export function remapId(ids: ReadonlyMap<string, string>, id: string): string {
  return ids.get(id) ?? id;
}

export function createIdMap(
  ids: string[],
  shouldRemapAll: boolean,
  conflictIds: ReadonlySet<string> = new Set()
): ReadonlyMap<string, string> {
  const uniqueIds = [...new Set(ids)];
  const idsToRemap = shouldRemapAll ? uniqueIds : uniqueIds.filter((id) => conflictIds.has(id));

  return new Map(idsToRemap.map((id) => [id, `import-${crypto.randomUUID()}`]));
}

export function collectVideoProjectAssetIds(descriptor: VideoBackupProjectDescriptor): string[] {
  return [
    ...descriptor.projectAssets.flatMap((asset) => collectEntryId(asset.entry)),
    ...descriptor.entry.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    ),
  ];
}

export function collectVideoProjectRecordingIds(
  descriptor: VideoBackupProjectDescriptor
): string[] {
  return descriptor.projectExports.flatMap((entry) => [
    entry.entry.recordingId,
    ...collectEntryId(entry.recording.entry),
  ]);
}

export function collectScenarioAssetIds(descriptor: ScenarioBackupProjectDescriptor): string[] {
  assertSupportedScenarioBackupProjectEntry(descriptor.entry);
  return descriptor.assets.flatMap((asset) => collectEntryId(asset.entry));
}

export function collectScenarioStepIds(descriptor: ScenarioBackupProjectDescriptor): string[] {
  assertSupportedScenarioBackupProjectEntry(descriptor.entry);
  return [
    ...descriptor.stepDocuments.map((entry) => entry.stepId),
    ...collectScenarioV3EditDocumentIds(descriptor),
  ];
}

function collectScenarioV3EditDocumentIds(descriptor: ScenarioBackupProjectDescriptor): string[] {
  const project = descriptor.entry.project;
  if (!isScenarioProjectV3(project)) {
    return [];
  }

  return [...project.slides, ...project.trash.map((entry) => entry.slide)].flatMap((slide) =>
    slide.elements.flatMap((element) =>
      element.kind === 'image' && element.editDocumentId ? [element.editDocumentId] : []
    )
  );
}

function collectEntryId(entry: object): string[] {
  return 'id' in entry && typeof entry.id === 'string' ? [entry.id] : [];
}
