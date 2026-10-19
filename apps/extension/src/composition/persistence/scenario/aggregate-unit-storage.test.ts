import { getTourAnnotations } from '@sniptale/runtime-contracts/scenario/types/tour';
import { afterEach, expect, it, vi } from 'vitest';
import { createAsset, getStore, stores } from './aggregate-mutations.test-support';
import { commitScenarioAggregateMutation } from './aggregate-mutations';
import { deleteOrphanedScenarioAggregateChild } from './aggregate-cleanup';
import {
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/factories';

const unchanged = 'Retained unit content '.repeat(100);
afterEach(() => vi.restoreAllMocks());

function project(kind: 'guide' | 'tour') {
  const value = createGuideProject('Initial', 'unit-project', 1);
  if (kind === 'guide')
    value.items = Array.from({ length: 3 }, (_, index) => ({
      ...createGuideStep(`Step ${index}`, `step-${index}`),
      blocks: [
        {
          kind: 'text' as const,
          id: `block-${index}`,
          paragraphs: createGuideParagraphs(unchanged),
        },
      ],
    }));
  else {
    value.tour = createTourDocument('tour');
    value.tour.slides = Array.from({ length: 3 }, (_, index) => ({
      ...createTourImageSlide(`slide-${index}`),
      actions: [
        {
          type: 'annotation' as const,
          object: { id: `annotation-${index}`, text: unchanged, anchor: null, appearance: null },
        },
      ],
    }));
  }
  return value;
}

async function baseline(kind: 'guide' | 'tour') {
  stores.set('scenario_project_units', new Map());
  const first = await commitScenarioAggregateMutation(project(kind));
  return commitScenarioAggregateMutation(
    { ...first.project, name: 'Admitted baseline' },
    { expectedRevision: first.workspaceRevision }
  );
}

it.each(['guide', 'tour'] as const)(
  'does not rewrite unchanged %s bodies when only the name changes',
  async (kind) => {
    const previous = await baseline(kind);
    const unitRows = getStore('scenario_project_units');
    const before = structuredClone([...unitRows]);
    const put = vi.spyOn(Map.prototype, 'set');
    const saved = await commitScenarioAggregateMutation(
      { ...previous.project, name: 'Latest name' },
      { expectedRevision: previous.workspaceRevision }
    );
    const rootWrites = put.mock.calls.filter(
      (_, index) => put.mock.contexts[index] === getStore('scenario_projects')
    );
    const historyWrites = put.mock.calls.filter(
      (_, index) => put.mock.contexts[index] === getStore('scenario_project_history')
    );
    expect(rootWrites).toHaveLength(1);
    expect(historyWrites).toHaveLength(1);
    expect(JSON.stringify([...rootWrites, ...historyWrites])).not.toContain(unchanged);
    expect(put.mock.contexts.filter((context) => context === unitRows)).toHaveLength(0);
    expect([...unitRows]).toEqual(before);
    expect(saved.project).toEqual({
      ...previous.project,
      name: 'Latest name',
      updatedAt: saved.project.updatedAt,
    });
    expect(saved.workspaceRevision).toBe(previous.workspaceRevision + 1);
  }
);

it.each(['guide', 'tour'] as const)(
  'encodes each unchanged %s body once per history measurement',
  async (kind) => {
    const previous = await baseline(kind);
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    await commitScenarioAggregateMutation(
      { ...previous.project, name: 'Measured name' },
      { expectedRevision: previous.workspaceRevision }
    );
    const repetitions = encode.mock.calls.reduce(
      (count, [text]) => count + (text?.split(unchanged).length ?? 1) - 1,
      0
    );
    expect(repetitions).toBe(6);
  }
);

it.each(['guide', 'tour'] as const)(
  'does not clone a privately admitted %s history during aggregate save',
  async (kind) => {
    const previous = await baseline(kind);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    await commitScenarioAggregateMutation(
      { ...previous.project, name: 'Owned snapshot' },
      { expectedRevision: previous.workspaceRevision }
    );
    expect(clone).not.toHaveBeenCalled();
  }
);

it.each([
  ['guide', 'title'],
  ['guide', 'text'],
  ['tour', 'title'],
  ['tour', 'text'],
] as const)(
  'writes only the changed %s unit for a %s edit and retains all old rows',
  async (kind, field) => {
    const previous = await baseline(kind);
    const next = structuredClone(previous.project);
    if (field === 'title') {
      if (kind === 'guide') next.items[1]!.title = 'Changed step';
      else next.tour!.slides[1]!.title = 'Changed slide';
    } else if (kind === 'guide') {
      const item = next.items[1]!;
      if (item.kind !== 'step') throw new Error('Expected Guide step');
      const block = item.blocks[0]!;
      if (block.kind !== 'text') throw new Error('Expected text block');
      block.paragraphs[0]!.runs[0]!.text = 'Changed nested text';
    } else {
      const slide = next.tour!.slides[1]!;
      if (slide.kind !== 'image') throw new Error('Expected image slide');
      getTourAnnotations(slide)[0]!.text = 'Changed annotation';
    }
    const units = getStore('scenario_project_units');
    const before = [...units].map(([key, value]) => [key, JSON.stringify(value)] as const);
    const puts = vi.spyOn(Map.prototype, 'set');
    const saved = await commitScenarioAggregateMutation(next, {
      expectedRevision: previous.workspaceRevision,
    });
    const writes = puts.mock.calls.filter((_, index) => puts.mock.contexts[index] === units);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toMatchObject({
      projectId: previous.project.id,
      unitId: kind === 'guide' ? 'guide:step-1' : 'tour:slide-1',
    });
    for (const [key, value] of before) expect(JSON.stringify(units.get(key))).toBe(value);
    expect(saved.project).toEqual({ ...next, updatedAt: saved.project.updatedAt });
  }
);

it.each([false, true])(
  'protects children when only orphan unit evidence remains (corrupt=%s)',
  async (corrupt) => {
    const value = project('guide');
    const asset = createAsset(value.id);
    getStore('scenario_assets').set(asset.id, asset);
    stores.set(
      'scenario_project_units',
      new Map([
        [
          JSON.stringify([value.id, 'guide:step-0', 1]),
          {
            projectId: value.id,
            unitId: 'guide:step-0',
            revision: 1,
            value: corrupt ? { kind: 'future' } : value.items[0],
          },
        ],
      ])
    );
    const before = structuredClone(stores);
    await expect(
      deleteOrphanedScenarioAggregateChild({ id: asset.id, kind: 'asset' })
    ).rejects.toThrow('still belongs');
    expect(stores).toEqual(before);
    expect((await import('../assets')).completePhysicalDeleteOperation).not.toHaveBeenCalled();
  }
);
