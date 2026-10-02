import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { LibraryStorageClass } from '../library-lifecycle/contracts';
import type { ScenarioProjectEntry } from './contracts';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from './read-guards';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';
import { parseAssetRef } from '../assets';
import { discardPreparedAsset } from '../assets';
import type {
  PreparedScenarioAssetEntry,
  ScenarioStepEditorDocumentEntry,
  StoredScenarioStepEditorDocumentEntry,
} from './contracts';
import type { AssetRef } from '../assets';

export const SCENARIO_ASSET_PUBLICATION_DOMAIN = 'scenario-assets';
export const SCENARIO_ASSET_OWNER_KIND = 'scenario-asset';
export const SCENARIO_ASSET_ROLE = 'body';

export interface ScenarioAggregateChildMutation {
  assetDeletes?: readonly string[];
  assetPuts?: readonly PreparedScenarioAssetEntry[];
  editorDocumentDeletes?: readonly string[];
  editorDocumentPuts?: readonly ScenarioStepEditorDocumentEntry[];
}

export interface PreparedScenarioStepEditorDocumentEntry extends StoredScenarioStepEditorDocumentEntry {
  assetRefs: AssetRef[];
}

export interface PreparedScenarioAggregateChildMutation extends Omit<
  ScenarioAggregateChildMutation,
  'editorDocumentPuts'
> {
  editorDocumentPuts?: readonly PreparedScenarioStepEditorDocumentEntry[];
}

export async function discardScenarioAggregateAssetPuts(
  children: ScenarioAggregateChildMutation | undefined
): Promise<void> {
  const results = await Promise.allSettled(
    (children?.assetPuts ?? [])
      .filter((asset) => !asset.borrowedMediaId)
      .map((asset) => discardPreparedAsset(asset.assetId))
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to discard uncommitted scenario assets.');
  }
}

export async function rejectScenarioMutationBeforeHandoff(
  children: Pick<ScenarioAggregateChildMutation, 'assetPuts'> | undefined,
  error: unknown
): Promise<never> {
  let cleanupError: unknown;
  try {
    await discardScenarioAggregateAssetPuts(children);
  } catch (caughtError) {
    cleanupError = caughtError;
  }
  if (cleanupError !== undefined) {
    throw new AggregateError(
      [error, cleanupError],
      'Scenario mutation was rejected before publication and asset cleanup was incomplete.',
      { cause: error }
    );
  }
  throw error;
}

export interface ScenarioAggregatePublicationPayload {
  baseRevision: number | null;
  children: PreparedScenarioAggregateChildMutation;
  committedAt: number;
  expectedUpdatedAt?: number | null;
  project: GuideProject;
  storageClass?: LibraryStorageClass;
  targetEntry: ScenarioProjectEntry;
}

function parsePreparedScenarioAsset(raw: unknown): PreparedScenarioAssetEntry | null {
  if (!isRecord(raw)) return null;
  const independent = raw['independentLibraryIdentity'];
  const parsedInput =
    independent === true && raw['galleryAssetId'] === null
      ? { ...raw, galleryAssetId: raw['borrowedMediaId'] }
      : raw;
  const entry = parseScenarioAssetEntry(parsedInput);
  const ref = parseAssetRef(raw['assetRef']);
  if (!entry || !ref || ref.assetId !== entry.assetId) return null;
  if (
    (independent !== undefined && independent !== true) ||
    (independent === true && !entry.borrowedMediaId)
  )
    return null;
  return {
    ...entry,
    ...(independent === true
      ? { galleryAssetId: null, independentLibraryIdentity: true as const }
      : {}),
    assetRef: ref,
  };
}

function parsePreparedScenarioDocument(
  raw: unknown
): PreparedScenarioStepEditorDocumentEntry | null {
  const entry = parseScenarioStepEditorDocumentEntry(raw);
  if (!entry || !isRecord(raw) || !Array.isArray(raw['assetRefs'])) return null;
  const refs = raw['assetRefs'].map(parseAssetRef);
  if (refs.some((ref) => ref === null)) return null;
  return { ...entry, assetRefs: refs.filter((ref): ref is AssetRef => ref !== null) };
}

function parsePreparedScenarioChildren(
  value: unknown
): PreparedScenarioAggregateChildMutation | null {
  if (!isRecord(value)) return null;
  const rawChildren = value;
  const rawAssetPuts = rawChildren['assetPuts'] ?? [];
  const rawAssetDeletes = rawChildren['assetDeletes'] ?? [];
  const rawDocumentPuts = rawChildren['editorDocumentPuts'] ?? [];
  const rawDocumentDeletes = rawChildren['editorDocumentDeletes'] ?? [];
  if (
    !Array.isArray(rawAssetPuts) ||
    !Array.isArray(rawAssetDeletes) ||
    !Array.isArray(rawDocumentPuts) ||
    !Array.isArray(rawDocumentDeletes)
  )
    return null;
  const assetPuts: PreparedScenarioAssetEntry[] = [];
  const rawAssetValues: unknown[] = rawAssetPuts;
  for (const raw of rawAssetValues) {
    const entry = parsePreparedScenarioAsset(raw);
    if (!entry) return null;
    assetPuts.push(entry);
  }
  const editorDocumentPuts: PreparedScenarioStepEditorDocumentEntry[] = [];
  const rawDocumentValues: unknown[] = rawDocumentPuts;
  for (const raw of rawDocumentValues) {
    const entry = parsePreparedScenarioDocument(raw);
    if (!entry) return null;
    editorDocumentPuts.push(entry);
  }
  const assetDeletes: unknown[] = rawAssetDeletes;
  if (!assetDeletes.every((id): id is string => typeof id === 'string')) return null;
  const editorDocumentDeletes: unknown[] = rawDocumentDeletes;
  if (!editorDocumentDeletes.every((id): id is string => typeof id === 'string')) return null;
  return { assetPuts, assetDeletes, editorDocumentPuts, editorDocumentDeletes };
}

/** Receives the ready aggregate payload before any scenario mutation is applied. */
export function parseScenarioAggregatePublicationPayload(
  value: unknown
): ScenarioAggregatePublicationPayload | null {
  if (!isRecord(value)) return null;
  const children = parsePreparedScenarioChildren(value['children']);
  const parsedProject = parseGuideProject(value['project']);
  const project = parsedProject.status === 'ok' ? parsedProject.project : null;
  const targetEntry = parseScenarioProjectEntry(value['targetEntry']);
  const baseRevision = value['baseRevision'];
  const committedAt = value['committedAt'];
  if (
    !project ||
    !targetEntry ||
    !children ||
    targetEntry.id !== project.id ||
    !(baseRevision === null || (Number.isInteger(baseRevision) && (baseRevision as number) >= 0)) ||
    typeof committedAt !== 'number' ||
    !Number.isFinite(committedAt)
  ) {
    return null;
  }
  const storageClass = value['storageClass'];
  if (storageClass !== undefined && storageClass !== 'library' && storageClass !== 'temporary') {
    return null;
  }
  const expectedUpdatedAt = value['expectedUpdatedAt'];
  if (
    expectedUpdatedAt !== undefined &&
    expectedUpdatedAt !== null &&
    typeof expectedUpdatedAt !== 'number'
  )
    return null;
  return {
    baseRevision: baseRevision as number | null,
    children,
    committedAt,
    ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
    project,
    ...(storageClass === undefined ? {} : { storageClass }),
    targetEntry,
  };
}
