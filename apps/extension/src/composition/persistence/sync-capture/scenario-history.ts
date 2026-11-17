import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry } from '../scenario/contracts';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { SCENARIO_HISTORY_BYTE_LIMIT, SCENARIO_HISTORY_LIMIT } from '../scenario/history-model';
import {
  encodeScenarioUnitStorage,
  materializeScenarioUnitStorage,
  sameScenarioStoredValue,
} from '../scenario/storage-units';

export const MAX_NATIVE_SCENARIO_HISTORY_BYTES =
  SCENARIO_HISTORY_BYTE_LIMIT + SCENARIO_HISTORY_LIMIT + 1;

type CurrentScenarioEntry = Omit<ScenarioProjectEntry, 'history' | 'editingHistory'>;

/** Detach both histories from the bounded capture and journal metadata. */
export function detachScenarioHistory(entry: ScenarioProjectEntry) {
  const { history, editingHistory, ...current } = entry;
  let text: string | null = null;
  if (editingHistory !== undefined) {
    const graph = encodeScenarioUnitStorage(entry, []);
    text = JSON.stringify({ kind: 'native-scenario-unit-history', version: 1, ...graph });
  } else if (history?.length) {
    text = JSON.stringify(history);
  }
  if (
    text !== null &&
    new TextEncoder().encode(text).byteLength > MAX_NATIVE_SCENARIO_HISTORY_BYTES
  )
    throw new Error('Native Scenario history exceeds its byte limit.');
  return { current, text };
}

/** Admit legacy arrays or a complete native graph bound to the exact detached current entry. */
export function materializeDetachedScenarioHistory(
  current: CurrentScenarioEntry,
  body: unknown
): ScenarioProjectEntry | null {
  if (body === undefined) return parseScenarioProjectEntry(current);
  if (Array.isArray(body)) return parseScenarioProjectEntry({ ...current, history: body });
  if (
    !isRecord(body) ||
    Object.keys(body).length !== 5 ||
    body['kind'] !== 'native-scenario-unit-history' ||
    body['version'] !== 1 ||
    !Array.isArray(body['rows']) ||
    !Array.isArray(body['units'])
  )
    return null;
  const entry = parseScenarioProjectEntry(
    materializeScenarioUnitStorage(body['head'], body['rows'], body['units'])
  );
  if (!entry || entry.editingHistory === undefined) return null;
  const { history: _history, editingHistory: _editing, ...bound } = entry;
  return sameScenarioStoredValue(bound, current) ? entry : null;
}
