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
  [false, true].flatMap((history) => [0, 1].map((delta) => ({ ...body, history, delta })))
);

it.each(byteCases)(
  'keeps exact UTF8 boundaries and retention for $guide/$tour/$emptySlides/$history/$delta',
  ({ guide, tour, emptySlides, history, delta }) => {
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
    encode.mockImplementation(function (this: TextEncoder, value) {
      const bytes = original.call(this, value);
      if (firstRoot && value?.includes('"project":{')) {
        firstRoot = false;
        Object.defineProperty(bytes, 'byteLength', {
          value: bytes.byteLength + SCENARIO_HISTORY_BYTE_LIMIT - fullBytes + delta,
        });
      }
      return bytes;
    });
    const parsed = parseScenarioSavedVersions(versions, previous.id, 2, 3);
    expect(parsed).toEqual(delta === 0 ? versions : null);
    firstRoot = true;
    if (delta === 1 && !history)
      expect(() => appendScenarioSavedVersion(previous)).toThrow('limit');
    else expect(appendScenarioSavedVersion(previous)).toEqual(delta === 0 ? versions : [version]);
  }
);
