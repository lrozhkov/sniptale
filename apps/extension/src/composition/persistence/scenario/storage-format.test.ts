import { expect, it } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import {
  materializeScenarioStorage,
  scenarioStorageHead,
  scenarioStorageRows,
} from './storage-format';

function retainedEntry() {
  const first = createScenarioProjectEntry({
    existing: undefined,
    project: createGuideProject('First', 'guide', 1),
    updatedAt: 2,
  });
  const second = createScenarioProjectEntry({
    existing: first,
    project: { ...first.project, name: 'Second' },
    updatedAt: 3,
  });
  return createScenarioProjectEntry({
    existing: second,
    project: { ...second.project, name: 'Current' },
    updatedAt: 4,
  });
}

it('stores a complete current project and ordered immutable historical rows, retaining logical shape', () => {
  const entry = retainedEntry();
  const head = scenarioStorageHead(entry);
  const rows = scenarioStorageRows(entry);
  expect(head).not.toHaveProperty('history');
  expect(head).toMatchObject({
    project: entry.project,
    historyFormatVersion: 1,
    savedVersionRevisions: [1, 2],
  });
  expect(rows).toEqual(entry.history?.map((version) => ({ projectId: entry.id, ...version })));
  expect(materializeScenarioStorage(head, rows.toReversed())).toEqual(entry);
  expect(parseScenarioProjectEntry(materializeScenarioStorage(head, rows))).toEqual(entry);
});

it('opens supported legacy and empty current history without conversion', () => {
  const entry = retainedEntry();
  expect(materializeScenarioStorage(entry, [])).toBe(entry);
  const { history: _history, ...empty } = entry;
  expect(materializeScenarioStorage(scenarioStorageHead(empty), [])).toEqual(empty);
  expect(materializeScenarioStorage(undefined, [])).toBeUndefined();
});

it('preserves unavailable physical evidence instead of admitting missing, foreign, duplicate or extra rows', () => {
  const entry = retainedEntry();
  const head = scenarioStorageHead(entry);
  const rows = scenarioStorageRows(entry);
  const first = rows[0];
  if (!first) throw new Error('Missing fixture history');
  for (const [root, history] of [
    [head, rows.slice(1)],
    [head, [...rows, first]],
    [head, [{ ...first, projectId: 'foreign' }, rows[1]]],
    [head, [...rows, { ...first, revision: 0 }]],
    [{ ...head, historyFormatVersion: 2 }, rows],
    [{ ...head, savedVersionRevisions: [2, 1] }, rows],
    [{ ...head, savedVersionRevisions: [1, 1] }, rows],
    [{ ...head, savedVersionRevisions: [1, 3] }, rows],
    [entry, rows],
    [undefined, rows],
  ] as const) {
    const before = JSON.stringify([root, history]);
    const logical = materializeScenarioStorage(root, [...history]);
    expect(logical).not.toBeUndefined();
    expect(parseScenarioProjectEntry(logical)).toBeNull();
    expect(JSON.stringify([root, history])).toBe(before);
  }
});

it('keeps canonical historical project and temporal admission at the existing parser boundary', () => {
  const entry = retainedEntry();
  const head = scenarioStorageHead(entry);
  const rows = scenarioStorageRows(entry);
  const first = rows[0];
  if (!first) throw new Error('Missing fixture history');
  for (const version of [
    { ...first, savedAt: entry.project.updatedAt },
    { ...first, project: { ...first.project, id: 'foreign' } },
    { ...first, project: { ...first.project, updatedAt: first.savedAt + 1 } },
    { ...first, project: { version: 99 } },
    { ...first, project: { ...first.project, extra: 'unknown' } },
  ])
    expect(
      parseScenarioProjectEntry(materializeScenarioStorage(head, [version, rows[1]]))
    ).toBeNull();
});
