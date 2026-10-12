import { afterEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import {
  createGuideParagraphs,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import {
  appendScenarioSavedVersion,
  parseScenarioSavedVersions,
  SCENARIO_HISTORY_BYTE_LIMIT,
  SCENARIO_HISTORY_LIMIT,
} from './history-model';
import type { ScenarioProjectEntry } from './contracts';
import { guideItemSchemas } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { SCENARIO_SAVED_VERSION_LIMITS } from '../../../features/editor-history/policy';
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

it('read-admits all fifty legacy versions before narrowing the next mutation to twenty', () => {
  const legacy = entry(50);
  legacy.history = Array.from({ length: 50 }, (_, revision) => ({
    revision,
    savedAt: revision + 1,
    project: entry(revision).project,
  }));
  const admitted = parseScenarioProjectEntry(legacy)!;
  expect(admitted.history).toHaveLength(SCENARIO_HISTORY_LIMIT);
  const next = createScenarioProjectEntry({
    existing: admitted,
    project: { ...admitted.project, name: 'Current' },
    updatedAt: 52,
  });
  expect(next.history).toHaveLength(20);
  expect(next.history?.[0]?.revision).toBe(31);
  expect(next.history?.at(-1)?.revision).toBe(50);
  expect(legacy.history).toHaveLength(50);
});

it('preserves the earliest previous snapshot across saves of one owner-issued action', () => {
  const original = entry(1);
  const historyActionId = '00000000-0000-4000-8000-000000000001';
  const first = createScenarioProjectEntry({
    existing: original,
    project: { ...original.project, name: 'A' },
    historyActionId,
    updatedAt: 3,
  });
  const final = createScenarioProjectEntry({
    existing: first,
    project: { ...first.project, name: 'AB' },
    historyActionId,
    updatedAt: 4,
  });
  expect(final.workspaceRevision).toBe(3);
  expect(final.history).toEqual([{ revision: 1, savedAt: 2, project: original.project }]);
  const command = createScenarioProjectEntry({
    existing: final,
    project: { ...final.project, name: 'Command' },
    updatedAt: 5,
  });
  expect(command).not.toHaveProperty('lastAcceptedActionId');
  const resumed = createScenarioProjectEntry({
    existing: command,
    project: { ...command.project, name: 'ABC' },
    historyActionId,
    updatedAt: 6,
  });
  expect(resumed.history?.at(-1)?.project.name).toBe('Command');
});

it('compacts preserved legacy versions and detaches borrowed roots without retaining an external action marker', () => {
  const previous = entry(50);
  previous.history = Array.from({ length: 50 }, (_, revision) => ({
    revision,
    savedAt: revision + 1,
    project: entry(revision).project,
  }));
  previous.lastAcceptedActionId = '00000000-0000-4000-8000-000000000001';
  const preserved = createScenarioProjectEntry({
    existing: previous,
    project: { ...previous.project, name: 'Normalization' },
    historyPolicy: 'preserve',
    updatedAt: 52,
  });
  expect(preserved.history).toHaveLength(20);
  expect(preserved).not.toHaveProperty('lastAcceptedActionId');
  expect(preserved.history?.[0]?.revision).toBe(30);
  expect(preserved.history?.[0]?.project).not.toBe(previous.history[30]?.project);
  const continued = createScenarioProjectEntry({
    existing: previous,
    project: { ...previous.project, name: 'Same action' },
    historyActionId: previous.lastAcceptedActionId,
    updatedAt: 52,
  });
  expect(continued.history).toHaveLength(20);
  expect(continued.history?.at(-1)?.revision).toBe(49);
  expect(previous.history).toHaveLength(50);
  const invalid = structuredClone(previous);
  invalid.history![0]!.project.id = 'foreign';
  expect(parseScenarioProjectEntry(invalid, 'exclusive')).toBeNull();
});

it('saves current when the newest previous version exceeds its separate sixteen-MiB budget', () => {
  const measured = new Uint8Array();
  Object.defineProperty(measured, 'byteLength', {
    value: SCENARIO_SAVED_VERSION_LIMITS.maxBytes + 1,
  });
  vi.spyOn(TextEncoder.prototype, 'encode').mockReturnValue(measured);
  const previous = entry(1);
  const current = createScenarioProjectEntry({
    existing: previous,
    project: { ...previous.project, name: 'Current survives' },
    updatedAt: 3,
  });
  expect(current.history ?? []).toEqual([]);
  expect(current.project.name).toBe('Current survives');
  expect(current.workspaceRevision).toBe(2);
});
it('admits shared Guide units once only inside a freshly owned history batch', () => {
  const source = unicodeEntry(true, false, false);
  const versions = Array.from({ length: 50 }, (_, index) => ({
    revision: index,
    savedAt: index + 1,
    project: { ...source.project, updatedAt: index + 1 },
  }));
  const owned = parseScenarioSavedVersions(versions, source.id, 50, 51, 'exclusive');
  const borrowed = parseScenarioSavedVersions(versions, source.id, 50, 51);
  expect(owned).toEqual(borrowed);
  expect(owned?.[0]?.project.items[0]).toBe(owned?.[49]?.project.items[0]);
  expect(owned?.[0]?.project.items[0]).not.toBe(source.project.items[0]);
  expect(borrowed?.[0]?.project.items[0]).not.toBe(borrowed?.[49]?.project.items[0]);
});

it('rechecks changed unit data on the next owned history read', () => {
  const source = unicodeEntry(true, false, false);
  const version = { revision: 1, savedAt: source.project.updatedAt, project: source.project };
  expect(parseScenarioSavedVersions([version], source.id, 2, 3, 'exclusive')).not.toBeNull();
  source.project.items[0]!.id = '';
  expect(parseScenarioSavedVersions([version], source.id, 2, 3, 'exclusive')).toBeNull();
});

it('stops owned item admission before invalid revision metadata or after the first byte overflow', () => {
  const first = unicodeEntry(true, false, false);
  const second = structuredClone(first);
  second.project.updatedAt = 3;
  const versions = [
    { revision: 1, savedAt: 2, project: first.project },
    { revision: 2, savedAt: 3, project: second.project },
  ];
  const parse = vi.spyOn(guideItemSchemas.step, 'safeParse');
  expect(parseScenarioSavedVersions(versions, first.id, 1, 4, 'exclusive')).toBeNull();
  expect(parse).not.toHaveBeenCalled();
  parse.mockClear();
  const measured = new Uint8Array();
  Object.defineProperty(measured, 'byteLength', { value: SCENARIO_HISTORY_BYTE_LIMIT + 1 });
  vi.spyOn(TextEncoder.prototype, 'encode').mockReturnValue(measured);
  expect(parseScenarioSavedVersions(versions, first.id, 3, 4, 'exclusive')).toBeNull();
  expect(parse).toHaveBeenCalledTimes(first.project.items.length);
});

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
it('keeps the latest twenty previous versions in ascending owner revision order', () => {
  let current = entry(0);
  for (let index = 1; index <= 55; index += 1)
    current = createScenarioProjectEntry({
      existing: current,
      project: { ...current.project, name: `Version ${index}` },
      updatedAt: index + 1,
    });
  expect(current.history).toHaveLength(SCENARIO_SAVED_VERSION_LIMITS.maxActions);
  expect(current.history?.[0]?.revision).toBe(35);
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
  ]) {
    expect(parseScenarioSavedVersions(values, 'guide', 2, 3)).toBeNull();
    expect(parseScenarioSavedVersions(values, 'guide', 2, 3, 'exclusive')).toBeNull();
  }
  expect(parseScenarioProjectEntry({ ...entry(2), history: [null] })).toBeNull();
});
it('enforces the metadata byte budget on append and on untrusted reads', () => {
  const measured = new Uint8Array();
  Object.defineProperty(measured, 'byteLength', { value: SCENARIO_HISTORY_BYTE_LIMIT + 1 });
  vi.spyOn(TextEncoder.prototype, 'encode').mockReturnValue(measured);
  expect(appendScenarioSavedVersion(entry(1))).toEqual([]);
  expect(
    parseScenarioSavedVersions(
      [{ revision: 1, savedAt: 2, project: entry(1).project }],
      'guide',
      2,
      3
    )
  ).toBeNull();
});

function unicodeEntry(guide: boolean, tour: boolean, emptySlides: boolean) {
  const previous = entry(1);
  const text = 'Unicode 😀汉é, quotes " and slash \\, newline\n tab\t lone \ud800';
  previous.project.name = text;
  previous.project.tags = [text];
  if (guide)
    previous.project.items = Array.from({ length: 3 }, (_, index) => ({
      ...createGuideStep(text, `step-${index}`),
      blocks: [
        {
          kind: 'text' as const,
          id: `block-${index}`,
          paragraphs: createGuideParagraphs(text),
        },
      ],
    }));
  if (tour) {
    previous.project.tour = createTourDocument('tour');
    previous.project.tour.slides = Array.from({ length: emptySlides ? 0 : 3 }, (_, index) => ({
      ...createTourImageSlide(`slide-${index}`),
      title: text,
      annotations: [{ id: `annotation-${index}`, text, anchor: null, appearance: null }],
    }));
  }
  return previous;
}

it('keeps all borrowed history detached and reuses only an explicitly exclusive snapshot', () => {
  const previous = unicodeEntry(true, true, false);
  previous.history = [{ revision: 0, savedAt: 1, project: structuredClone(previous.project) }];
  previous.history[0]!.project.updatedAt = 1;
  const before = structuredClone(previous);
  const project = structuredClone({ ...previous.project, name: 'Next' });
  const borrowed = createScenarioProjectEntry({ existing: previous, project, updatedAt: 3 });
  const clone = vi.spyOn(globalThis, 'structuredClone');
  const owned = createScenarioProjectEntry({
    existing: previous,
    project,
    updatedAt: 3,
    historyOwnership: 'exclusive',
  });
  expect(clone).not.toHaveBeenCalled();
  expect(owned).toEqual(borrowed);
  expect(owned.history?.[0]).toBe(previous.history[0]);
  expect(owned.history?.[1]?.project).toBe(previous.project);
  expect(owned.history?.[1]?.project.items).not.toBe(owned.project.items);
  expect(owned.history?.[1]?.project.tour?.slides).not.toBe(owned.project.tour?.slides);
  expect(borrowed.history?.[0]).not.toBe(previous.history[0]);
  expect(borrowed.history?.[1]?.project).not.toBe(previous.project);
  borrowed.history![0]!.project.items[0]!.title = 'Changed older step';
  borrowed.history![1]!.project.tour!.slides[0]!.title = 'Changed current slide';
  borrowed.history![0]!.project.name = 'Changed older root';
  borrowed.history![1]!.project.name = 'Changed previous root';
  expect(previous).toEqual(before);
});

const byteCases = [
  { guide: false, tour: false, emptySlides: false },
  { guide: true, tour: false, emptySlides: false },
  { guide: false, tour: true, emptySlides: false },
  { guide: true, tour: true, emptySlides: false },
  { guide: false, tour: true, emptySlides: true },
  { guide: true, tour: true, emptySlides: true },
].flatMap((body) =>
  [false, true].flatMap((history) =>
    [0, 1].flatMap((delta) =>
      (['borrowed', 'exclusive'] as const).map((ownership) => ({
        ...body,
        history,
        delta,
        ownership,
      }))
    )
  )
);

it.each(byteCases)(
  'keeps exact UTF8 boundaries and retention for $guide/$tour/$emptySlides/$history/$delta/$ownership',
  ({ guide, tour, emptySlides, history, delta, ownership }) => {
    const previous = unicodeEntry(guide, tour, emptySlides);
    const version = { revision: 1, savedAt: 2, project: previous.project };
    if (history) {
      const earlier = structuredClone(version);
      earlier.revision = 0;
      earlier.savedAt = 1;
      earlier.project.updatedAt = 1;
      earlier.project.name = 'Earlier Unicode 汉';
      if (earlier.project.items[0]) earlier.project.items[0].title = 'Earlier step é';
      if (earlier.project.tour?.slides[0])
        earlier.project.tour.slides[0].title = 'Earlier slide 😀';
      previous.history = [earlier];
    }
    const versions = [...(previous.history ?? []), version];
    const original = TextEncoder.prototype.encode;
    const fullBytes = versions.reduce(
      (total, value) => total + original.call(new TextEncoder(), JSON.stringify(value)).byteLength,
      0
    );
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    let firstRoot = true;
    let measuredBudget = SCENARIO_HISTORY_BYTE_LIMIT;
    let framingBytes = 0;
    encode.mockImplementation(function (this: TextEncoder, value) {
      const bytes = original.call(this, value);
      if (firstRoot && value?.includes('"project":{')) {
        firstRoot = false;
        Object.defineProperty(bytes, 'byteLength', {
          value: bytes.byteLength + measuredBudget - fullBytes - framingBytes + delta,
        });
      }
      return bytes;
    });
    const parsed = parseScenarioSavedVersions(versions, previous.id, 2, 3, ownership);
    expect(parsed).toEqual(delta === 0 ? versions : null);
    firstRoot = true;
    measuredBudget = SCENARIO_SAVED_VERSION_LIMITS.maxBytes;
    framingBytes = versions.length + 1;
    expect(appendScenarioSavedVersion(previous, ownership)).toEqual(
      delta === 0 ? versions : history ? [version] : []
    );
  }
);
