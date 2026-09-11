import { afterEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import {
  appendScenarioSavedVersion,
  parseScenarioSavedVersions,
  SCENARIO_HISTORY_BYTE_LIMIT,
  SCENARIO_HISTORY_LIMIT,
} from './history-model';
import type { ScenarioProjectEntry } from './contracts';
function entry(revision: number): ScenarioProjectEntry {
  const project = createGuideProject(`Version ${revision}`, 'guide', 1);
  project.updatedAt = revision + 1;
  return {
    id: project.id,
    project,
    workspaceRevision: revision,
    createdAt: 1,
    updatedAt: project.updatedAt,
  };
}
afterEach(() => vi.restoreAllMocks());
it('retains committed content as a detached previous version and increments the current revision', () => {
  const previous = entry(1);
  const current = createScenarioProjectEntry({
    existing: previous,
    project: { ...previous.project, name: 'New name' },
    updatedAt: 3,
  });
  expect(current.workspaceRevision).toBe(2);
  expect(current.history).toEqual([{ revision: 1, savedAt: 2, project: previous.project }]);
  expect(current.project.name).toBe('New name');
  if (!current.history?.[0]) throw new Error('Missing version');
  current.history[0].project.name = 'Changed copy';
  expect(previous.project.name).toBe('Version 1');
  expect(
    createScenarioProjectEntry({ existing: undefined, project: previous.project }).history
  ).toBeUndefined();
});
it('keeps the latest fifty previous versions in ascending owner revision order', () => {
  let current = entry(0);
  for (let index = 1; index <= 55; index += 1)
    current = createScenarioProjectEntry({
      existing: current,
      project: { ...current.project, name: `Version ${index}` },
      updatedAt: index + 1,
    });
  expect(current.history).toHaveLength(SCENARIO_HISTORY_LIMIT);
  expect(current.history?.[0]?.revision).toBe(5);
  expect(current.history?.at(-1)?.revision).toBe(54);
  expect(parseScenarioProjectEntry(current)?.history).toEqual(current.history);
});
it('rejects foreign, nonmonotonic, future and malformed historical snapshots', () => {
  const version = { revision: 1, savedAt: 2, project: entry(1).project };
  expect(parseScenarioSavedVersions([version], 'guide', 2, 3)).toEqual([version]);
  for (const values of [
    [{ ...version, project: { ...version.project, id: 'foreign' } }],
    [version, version],
    [{ ...version, revision: 2 }],
    [{ ...version, savedAt: 3 }],
    [{ ...version, savedAt: NaN }],
    [{ ...version, project: { version: 3 } }],
    Array.from({ length: 51 }, () => version),
  ])
    expect(parseScenarioSavedVersions(values, 'guide', 2, 3)).toBeNull();
  expect(parseScenarioProjectEntry({ ...entry(2), history: [null] })).toBeNull();
});
it('enforces the metadata byte budget on append and on untrusted reads', () => {
  const measured = new Uint8Array();
  Object.defineProperty(measured, 'byteLength', { value: SCENARIO_HISTORY_BYTE_LIMIT + 1 });
  vi.spyOn(TextEncoder.prototype, 'encode').mockReturnValue(measured);
  expect(() => appendScenarioSavedVersion(entry(1))).toThrow('limit');
  expect(
    parseScenarioSavedVersions(
      [{ revision: 1, savedAt: 2, project: entry(1).project }],
      'guide',
      2,
      3
    )
  ).toBeNull();
});
