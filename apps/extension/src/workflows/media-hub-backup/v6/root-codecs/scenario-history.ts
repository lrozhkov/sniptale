import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry } from '../../../../composition/persistence/scenario/contracts';
import { parseScenarioProjectEntry } from '../../../../composition/persistence/scenario/read-guards';
import {
  encodeScenarioUnitStorage,
  materializeScenarioUnitStorage,
} from '../../../../composition/persistence/scenario/storage-units';
import type { JsonValue } from '../contracts';

export interface PortableScenarioUnitHistory {
  kind: 'scenario-unit-history';
  version: 1;
  head: JsonValue;
  rows: JsonValue[];
  units: JsonValue[];
}

function invalid(): never {
  throw new Error('Portable Scenario history graph is invalid.');
}

/** Only logical child references cross this boundary; native asset keys are forbidden on input. */
function references(value: unknown, direction: 'encode' | 'decode', depth = 0): JsonValue {
  if (depth > 64) return invalid();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => references(item, direction, depth + 1));
  if (!isPlainRecord(value)) return invalid();
  const from = direction === 'encode' ? 'assetId' : 'scenarioAssetId';
  const to = direction === 'encode' ? 'scenarioAssetId' : 'assetId';
  if (Object.hasOwn(value, to)) return invalid();
  return Object.fromEntries(
    Object.entries(value).map(([key, child]): [string, JsonValue] => {
      if (key === from && typeof child !== 'string') return invalid();
      return [key === from ? to : key, references(child, direction, depth + 1)];
    })
  );
}

/** Reuses the native shared-unit graph for current, saved and both editing branches. */
export function encodePortableScenarioUnitHistory(
  entry: ScenarioProjectEntry
): PortableScenarioUnitHistory {
  const admitted = parseScenarioProjectEntry(entry);
  if (!admitted?.editingHistory) return invalid();
  const graph = encodeScenarioUnitStorage(admitted, []);
  return {
    kind: 'scenario-unit-history',
    version: 1,
    head: references(graph.head, 'encode'),
    rows: graph.rows.map((row) => references(row, 'encode')),
    units: graph.units.map((unit) => references(unit, 'encode')),
  };
}

/** Complete native graph admission precedes every archive resource remap and publication. */
export function decodePortableScenarioUnitHistory(
  value: unknown,
  projectId: string
): ScenarioProjectEntry {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 5 ||
    value['kind'] !== 'scenario-unit-history' ||
    value['version'] !== 1 ||
    !Array.isArray(value['rows']) ||
    !Array.isArray(value['units'])
  )
    return invalid();
  const head = references(value['head'], 'decode');
  const rows = value['rows'].map((row) => references(row, 'decode'));
  const units = value['units'].map((unit) => references(unit, 'decode'));
  const entry = parseScenarioProjectEntry(materializeScenarioUnitStorage(head, rows, units));
  if (!entry?.editingHistory || entry.id !== projectId) return invalid();
  return entry;
}
