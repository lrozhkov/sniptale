import { readCaptureRootState } from './guards';
import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseScenarioAssetEntry } from '../scenario/read-guards';
import type { ScenarioAssetEntry } from '../scenario/contracts';
import { parseAssetOwner, parseAssetRef } from '../assets/guards';
import type { AssetRef } from '../assets/contracts';
import { ASSET_OWNERS_STORE } from '../infrastructure/indexed-db/core.stores';
import { captureRootKey, type CausalRootDependency } from './contracts';
import { freezeScenarioInTransaction, digestCapturedScenarioRows } from './scenario-snapshot';

type ScenarioTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;

/** Target-owned immutable Scenario children and the native head admitted for this publication. */
export interface PreparedScenarioProjectDependency {
  rootKind: 'scenario-project';
  rootId: string;
  expectedGeneration: number;
  expectedBasis: readonly string[];
  expectedWorkspaceRevision: number;
  nativeDigest: string;
  children: { entry: ScenarioAssetEntry; ref: AssetRef }[];
}

/** Recheck journal values before they can authorize borrowed native resources. */
export function parsePreparedScenarioProjectDependencies(
  value: unknown
): PreparedScenarioProjectDependency[] {
  if (!Array.isArray(value) || value.length > 32)
    throw new Error('Invalid Scenario project dependencies.');
  const ids = new Set<string>();
  const children = new Set<string>();
  return value.map((raw): PreparedScenarioProjectDependency => {
    if (
      !isRecord(raw) ||
      raw['rootKind'] !== 'scenario-project' ||
      typeof raw['rootId'] !== 'string' ||
      !raw['rootId'] ||
      raw['rootId'].length > 256 ||
      ids.has(raw['rootId']) ||
      typeof raw['expectedGeneration'] !== 'number' ||
      !Number.isSafeInteger(raw['expectedGeneration']) ||
      raw['expectedGeneration'] < 1 ||
      typeof raw['expectedWorkspaceRevision'] !== 'number' ||
      !Number.isSafeInteger(raw['expectedWorkspaceRevision']) ||
      raw['expectedWorkspaceRevision'] < 0 ||
      typeof raw['nativeDigest'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(raw['nativeDigest']) ||
      !Array.isArray(raw['expectedBasis']) ||
      raw['expectedBasis'].length !== 1 ||
      typeof raw['expectedBasis'][0] !== 'string' ||
      !raw['expectedBasis'][0] ||
      raw['expectedBasis'][0].length > 256 ||
      !Array.isArray(raw['children']) ||
      raw['children'].length > 32
    )
      throw new Error('Invalid Scenario project dependency.');
    ids.add(raw['rootId']);
    const rootId = raw['rootId'];
    return {
      rootKind: 'scenario-project',
      rootId,
      expectedGeneration: raw['expectedGeneration'],
      expectedWorkspaceRevision: raw['expectedWorkspaceRevision'],
      nativeDigest: raw['nativeDigest'],
      expectedBasis: [raw['expectedBasis'][0]],
      children: raw['children'].map((child) => {
        if (!isRecord(child)) throw new Error('Invalid Scenario project child.');
        const entry = parseScenarioAssetEntry(child['entry']);
        const ref = parseAssetRef(child['ref']);
        if (
          !entry ||
          !ref ||
          entry.projectId !== rootId ||
          children.has(entry.id) ||
          ref.assetId !== entry.assetId ||
          ref.size !== entry.size ||
          ref.mimeType !== entry.mimeType
        )
          throw new Error('Invalid Scenario project child.');
        children.add(entry.id);
        return { entry, ref };
      }),
    };
  });
}

/** Read target-owned prerequisite evidence in the caller's existing native transaction. */
export async function readScenarioProjectDependenciesInTransaction(
  tx: ScenarioTransaction,
  spaceId: string,
  declared: readonly CausalRootDependency[]
): Promise<PreparedScenarioProjectDependency[] | null> {
  if (declared.length > 32 || new Set(declared.map((item) => item.rootId)).size !== declared.length)
    return null;
  const result: PreparedScenarioProjectDependency[] = [];
  for (const dependency of declared) {
    const current = await readScenarioProjectDependency(tx, spaceId, dependency);
    if (!current) return null;
    result.push(current);
  }
  return result;
}

async function readScenarioProjectDependency(
  tx: ScenarioTransaction,
  spaceId: string,
  dependency: CausalRootDependency
): Promise<PreparedScenarioProjectDependency | null> {
  if (
    dependency.rootKind !== 'scenario-project' ||
    !dependency.rootId ||
    dependency.rootId.length > 256 ||
    dependency.basis.length !== 1 ||
    dependency.childIds.length > 32 ||
    new Set(dependency.childIds).size !== dependency.childIds.length
  )
    return null;
  const rootKey = captureRootKey(spaceId, 'scenario-project', dependency.rootId);
  const state = await readCaptureRootState(tx, rootKey, undefined);
  if (
    !state ||
    state.rootKind !== 'scenario-project' ||
    state.rootId !== dependency.rootId ||
    state.spaceId !== spaceId ||
    state.deleted ||
    state.basis.length !== 1 ||
    JSON.stringify(state.basis) !== JSON.stringify(dependency.basis)
  )
    return null;
  const rows = await freezeScenarioInTransaction(tx, dependency.rootId);
  const nativeDigest = digestCapturedScenarioRows(rows);
  if (state.nativeDigest !== nativeDigest) return null;
  const children: PreparedScenarioProjectDependency['children'] = [];
  for (const id of dependency.childIds) {
    const entry = rows.assets.find((asset) => asset.id === id);
    const ref = entry && rows.refs.find((item) => item.assetId === entry.assetId);
    const owner = parseAssetOwner(
      await tx.objectStore(ASSET_OWNERS_STORE).get(['scenario-asset', id, 'body'])
    );
    if (
      !entry ||
      !ref ||
      entry.projectId !== dependency.rootId ||
      !owner ||
      owner.ownerKind !== 'scenario-asset' ||
      owner.ownerId !== id ||
      owner.role !== 'body' ||
      owner.assetId !== entry.assetId
    )
      return null;
    children.push({ entry, ref });
  }
  return {
    rootKind: 'scenario-project',
    rootId: dependency.rootId,
    expectedGeneration: state.generation,
    expectedBasis: state.basis,
    expectedWorkspaceRevision: rows.entry.workspaceRevision,
    nativeDigest,
    children,
  };
}

/** Repeat native head, revision, immutable ref and retained owner checks immediately before publication. */
export async function verifyScenarioProjectDependenciesInTransaction(
  tx: ScenarioTransaction,
  spaceId: string,
  expected: readonly PreparedScenarioProjectDependency[]
): Promise<boolean> {
  const current = await readScenarioProjectDependenciesInTransaction(
    tx,
    spaceId,
    expected.map((item) => ({
      rootKind: 'scenario-project',
      rootId: item.rootId,
      basis: [...item.expectedBasis],
      childIds: item.children.map((child) => child.entry.id),
    }))
  );
  return (
    current !== null &&
    current.every((item, index) => {
      const previous = expected[index];
      return (
        previous !== undefined &&
        item.expectedGeneration === previous.expectedGeneration &&
        item.expectedWorkspaceRevision === previous.expectedWorkspaceRevision &&
        item.nativeDigest === previous.nativeDigest &&
        JSON.stringify(item.children) === JSON.stringify(previous.children)
      );
    })
  );
}
