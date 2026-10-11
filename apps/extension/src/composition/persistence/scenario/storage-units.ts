import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { TOUR_LIMITS } from '@sniptale/runtime-contracts/scenario/types/tour';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry } from './contracts';
import { SCENARIO_HISTORY_LIMIT } from './history-model';
import { materializeScenarioStorage } from './storage-format';

interface UnitRow {
  projectId: string;
  unitId: string;
  revision: number;
  value: unknown;
}

function unitKey(unitId: string, revision: number): string {
  return JSON.stringify([unitId, revision]);
}

/** Compares canonical JSON data without another whole-history JSON serialization. */
export function sameScenarioStoredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameScenarioStoredValue(value, right[index]))
    );
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameScenarioStoredValue(left[key], right[key]))
  );
}

function unavailable(head: unknown, rows: unknown[], units: unknown[]) {
  return {
    ...(isRecord(head) ? head : {}),
    project: {
      ...(isRecord(head) && isRecord(head['project']) ? head['project'] : {}),
      version: 0,
    },
    historyEvidence: rows,
    unitEvidence: units,
  };
}

function indexScenarioUnits(units: unknown[], projectId: string) {
  const indexed = new Map<string, Record<string, unknown>>();
  for (const row of units) {
    if (
      !isRecord(row) ||
      Object.keys(row).length !== 4 ||
      row['projectId'] !== projectId ||
      typeof row['unitId'] !== 'string' ||
      typeof row['revision'] !== 'number' ||
      !Number.isSafeInteger(row['revision']) ||
      row['revision'] < 1 ||
      !Object.hasOwn(row, 'value')
    )
      return null;
    const key = unitKey(row['unitId'], row['revision']);
    if (indexed.has(key)) return null;
    indexed.set(key, row);
  }
  return indexed;
}

/** Every unit must be scoped, referenced and complete before canonical logical admission. */
export function materializeScenarioUnitStorage(
  head: unknown,
  rows: unknown[],
  units: unknown[]
): unknown {
  if (!isRecord(head) || head['historyFormatVersion'] !== 2)
    return units.length ? unavailable(head, rows, units) : materializeScenarioStorage(head, rows);
  const projectId = head['id'];
  if (
    typeof projectId !== 'string' ||
    rows.length > SCENARIO_HISTORY_LIMIT ||
    units.length > (GUIDE_LIMITS.maxItems + TOUR_LIMITS.maxSlides) * (SCENARIO_HISTORY_LIMIT + 1)
  )
    return unavailable(head, rows, units);
  const parsedUnits = indexScenarioUnits(units, projectId);
  if (!parsedUnits) return unavailable(head, rows, units);
  const indexed = parsedUnits;
  const used = new Set<string>();
  function body(values: unknown, kind: 'guide' | 'tour'): unknown[] | null {
    const limit = kind === 'guide' ? GUIDE_LIMITS.maxItems : TOUR_LIMITS.maxSlides;
    if (!Array.isArray(values) || values.length > limit) return null;
    const result: unknown[] = [];
    const ids = new Set<string>();
    for (const ref of values) {
      if (
        !isRecord(ref) ||
        Object.keys(ref).length !== 2 ||
        typeof ref['unitId'] !== 'string' ||
        !ref['unitId'].startsWith(`${kind}:`) ||
        typeof ref['revision'] !== 'number' ||
        !Number.isSafeInteger(ref['revision']) ||
        ids.has(ref['unitId'])
      )
        return null;
      const key = unitKey(ref['unitId'], ref['revision']);
      const row = indexed.get(key);
      const value = row?.['value'];
      if (!isRecord(value) || `${kind}:${String(value['id'])}` !== ref['unitId']) return null;
      ids.add(ref['unitId']);
      used.add(key);
      result.push(value);
    }
    return result;
  }
  function project(value: unknown): unknown | null {
    if (!isRecord(value)) return null;
    const items = body(value['items'], 'guide');
    if (!items) return null;
    const tour = value['tour'];
    if (tour === undefined) return { ...value, items };
    if (!isRecord(tour)) return null;
    const slides = body(tour['slides'], 'tour');
    return slides ? { ...value, items, tour: { ...tour, slides } } : null;
  }
  const current = project(head['project']);
  if (!current) return unavailable(head, rows, units);
  const history: unknown[] = [];
  for (const row of rows) {
    if (!isRecord(row)) return unavailable(head, rows, units);
    const content = project(row['project']);
    if (!content) return unavailable(head, rows, units);
    history.push({ ...row, project: content });
  }
  if (used.size !== indexed.size) return unavailable(head, rows, units);
  return materializeScenarioStorage(
    { ...head, project: current, historyFormatVersion: 1 },
    history
  );
}

/** One caller transaction determines row identities; none is a project revision or writer. */
export function encodeScenarioUnitStorage(entry: ScenarioProjectEntry, existingUnits: unknown[]) {
  const candidates = new Map<string, UnitRow[]>();
  for (const raw of existingUnits) {
    if (!isRecord(raw) || typeof raw['unitId'] !== 'string' || typeof raw['revision'] !== 'number')
      throw new Error('Scenario unit content is unavailable.');
    const row = {
      projectId: entry.id,
      unitId: raw['unitId'],
      revision: raw['revision'],
      value: raw['value'],
    };
    const own = candidates.get(row.unitId) ?? [];
    own.push(row);
    candidates.set(row.unitId, own);
  }
  const used = new Map<string, UnitRow>();
  function reference(value: { id: string }, kind: 'guide' | 'tour') {
    const unitId = `${kind}:${value.id}`;
    const own = candidates.get(unitId) ?? [];
    let row = own.find((candidate) => sameScenarioStoredValue(candidate.value, value));
    if (!row) {
      const revision = Math.max(0, ...own.map((candidate) => candidate.revision)) + 1;
      if (!Number.isSafeInteger(revision))
        throw new Error('Scenario unit revision is unavailable.');
      row = { projectId: entry.id, unitId, revision, value };
      own.push(row);
      candidates.set(unitId, own);
    }
    used.set(unitKey(unitId, row.revision), row);
    return { unitId, revision: row.revision };
  }
  function project(value: GuideProject) {
    const { items, tour, ...root } = value;
    const current = { ...root, items: items.map((item) => reference(item, 'guide')) };
    if (!tour) return current;
    const { slides, ...settings } = tour;
    return {
      ...current,
      tour: { ...settings, slides: slides.map((slide) => reference(slide, 'tour')) },
    };
  }
  const { history, ...current } = entry;
  const rows = (history ?? []).map((version) => ({
    ...version,
    projectId: entry.id,
    project: project(version.project),
  }));
  const head = {
    ...current,
    project: project(entry.project),
    historyFormatVersion: 2,
    savedVersionRevisions: rows.map((row) => row.revision),
  };
  return { head, rows, units: [...used.values()] };
}
