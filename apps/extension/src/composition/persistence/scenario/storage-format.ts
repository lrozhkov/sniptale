import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry } from './contracts';
import { SCENARIO_HISTORY_LIMIT } from './history-model';

/** Private head retains current content; portable and logical history remain unchanged. */
export function scenarioStorageHead(entry: ScenarioProjectEntry) {
  const { history, ...current } = entry;
  return {
    ...current,
    historyFormatVersion: 1,
    savedVersionRevisions: (history ?? []).map((version) => version.revision),
  };
}

/** Each committed previous version has one immutable aggregate-scoped physical key. */
export function scenarioStorageRows(entry: ScenarioProjectEntry) {
  return (entry.history ?? []).map((version) => ({ projectId: entry.id, ...version }));
}

function unavailableStorage(head: unknown, rows: unknown[]) {
  return {
    ...(isRecord(head) ? head : {}),
    project: {
      ...(isRecord(head) && isRecord(head['project']) ? head['project'] : {}),
      version: 0,
    },
    historyEvidence: rows,
  };
}

/** Requires the entire physical graph before the existing canonical logical admission. */
export function materializeScenarioStorage(head: unknown, rows: unknown[]): unknown {
  if (head === undefined && rows.length === 0) return undefined;
  if (!isRecord(head)) return unavailableStorage(head, rows);
  if (!Object.hasOwn(head, 'historyFormatVersion'))
    return rows.length === 0 ? head : unavailableStorage(head, rows);
  const revisions = head['savedVersionRevisions'];
  const currentRevision = head['workspaceRevision'];
  if (
    head['historyFormatVersion'] !== 1 ||
    Object.hasOwn(head, 'history') ||
    typeof head['id'] !== 'string' ||
    typeof currentRevision !== 'number' ||
    !Number.isSafeInteger(currentRevision) ||
    !Array.isArray(revisions) ||
    revisions.length > SCENARIO_HISTORY_LIMIT ||
    revisions.length !== rows.length
  )
    return unavailableStorage(head, rows);
  const byRevision = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    if (
      !isRecord(row) ||
      Object.keys(row).length !== 4 ||
      row['projectId'] !== head['id'] ||
      typeof row['revision'] !== 'number' ||
      !Number.isSafeInteger(row['revision']) ||
      byRevision.has(row['revision'])
    )
      return unavailableStorage(head, rows);
    byRevision.set(row['revision'], row);
  }
  const history: unknown[] = [];
  let previous = -1;
  for (const revision of revisions) {
    if (
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision <= previous ||
      revision >= currentRevision
    )
      return unavailableStorage(head, rows);
    const row = byRevision.get(revision);
    if (!row || !Object.hasOwn(row, 'savedAt') || !Object.hasOwn(row, 'project'))
      return unavailableStorage(head, rows);
    history.push({ revision, savedAt: row['savedAt'], project: row['project'] });
    previous = revision;
  }
  const { historyFormatVersion: _format, savedVersionRevisions: _revisions, ...entry } = head;
  return { ...entry, ...(history.length ? { history } : {}) };
}
