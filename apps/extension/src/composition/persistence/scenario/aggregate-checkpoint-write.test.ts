import { expect, it, vi } from 'vitest';
import { stores, createAsset, createDocument } from './aggregate-mutations.test-support';
import { getScenarioEditingSnapshot } from './history';
import { commitScenarioAggregateMutation } from './aggregate-mutations';
import { getScenarioProjectEntry } from './projects/project';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/factories';
import { recoverStandaloneAssetPublications } from '../assets';
import { deleteScenarioAggregate } from './aggregate-cleanup';

it('publishes a cursor-only checkpoint without adding a saved content version', async () => {
  const first = await commitScenarioAggregateMutation(
    createGuideProject('Current', 'checkpoint', 1),
    {
      expectedRevision: null,
    }
  );
  const checkpoint = {
    version: 1 as const,
    past: [{ ...first.project, name: 'Before' }],
    future: [{ ...first.project, name: 'After' }],
  };
  const next = await commitScenarioAggregateMutation(first.project, {
    expectedRevision: first.workspaceRevision,
    editingHistory: checkpoint,
  });
  expect(next.workspaceRevision).toBeGreaterThan(first.workspaceRevision);
  expect(next.editingHistory).toEqual(checkpoint);
  const reopened = await getScenarioProjectEntry(first.project.id);
  expect(reopened?.editingHistory).toEqual(checkpoint);
  expect(reopened?.history ?? []).toEqual([]);
  expect(reopened?.project.name).toBe('Current');
});

it('refuses a stale cursor-only write without changing the accepted graph', async () => {
  const first = await commitScenarioAggregateMutation(createGuideProject('Current', 'stale', 1), {
    expectedRevision: null,
  });
  const before = structuredClone(stores);
  await expect(
    commitScenarioAggregateMutation(first.project, {
      expectedRevision: first.workspaceRevision - 1,
      editingHistory: { version: 1, past: [], future: [] },
    })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  expect(stores).toEqual(before);
});

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it('captures branches before recovery and does not retain caller-owned mutations', async () => {
  const first = await commitScenarioAggregateMutation(createGuideProject('Current', 'capture', 1));
  const entered = gate();
  const resume = gate();
  vi.mocked(recoverStandaloneAssetPublications).mockImplementationOnce(async () => {
    entered.release();
    await resume.promise;
    return 0;
  });
  const checkpoint = {
    version: 1 as const,
    past: [],
    future: [{ ...first.project, name: 'Captured' }],
  };
  const writing = commitScenarioAggregateMutation(first.project, {
    expectedRevision: first.workspaceRevision,
    editingHistory: checkpoint,
  });
  await entered.promise;
  checkpoint.future[0]!.name = 'Late caller mutation';
  checkpoint.future.push({ ...first.project, name: 'Late future action' });
  resume.release();
  const result = await writing;
  expect(result.editingHistory?.future.map((project) => project.name)).toEqual(['Captured']);
  expect((await getScenarioProjectEntry(first.project.id))?.editingHistory).toEqual(
    result.editingHistory
  );
});

it('orders two checkpoint writers against the same predecessor without overwriting the winner', async () => {
  const first = await commitScenarioAggregateMutation(createGuideProject('Current', 'parallel', 1));
  const entered = gate();
  const resume = gate();
  vi.mocked(recoverStandaloneAssetPublications).mockImplementationOnce(async () => {
    entered.release();
    await resume.promise;
    return 0;
  });
  const delayed = commitScenarioAggregateMutation(first.project, {
    expectedRevision: first.workspaceRevision,
    editingHistory: { version: 1, past: [], future: [{ ...first.project, name: 'Loser' }] },
  });
  await entered.promise;
  const winner = await commitScenarioAggregateMutation(first.project, {
    expectedRevision: first.workspaceRevision,
    editingHistory: { version: 1, past: [{ ...first.project, name: 'Winner' }], future: [] },
  });
  resume.release();
  await expect(delayed).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  expect((await getScenarioProjectEntry(first.project.id))?.editingHistory).toEqual(
    winner.editingHistory
  );
});

it('rejects old cursor and opening writers after deletion and same-ID recreation', async () => {
  const project = createGuideProject('Current', 'recreated-checkpoint', 1);
  const checkpoint = { version: 1 as const, past: [], future: [{ ...project, name: 'Future' }] };
  const first = await commitScenarioAggregateMutation(project, {
    expectedRevision: null,
    editingHistory: checkpoint,
  });
  expect(first.editingHistory).toEqual(checkpoint);
  await deleteScenarioAggregate(project.id);
  const recreated = await commitScenarioAggregateMutation(project, { expectedRevision: null });
  expect(recreated.workspaceRevision).toBeGreaterThan(first.workspaceRevision);
  const before = structuredClone(stores);
  for (const expectedRevision of [first.workspaceRevision, null]) {
    await expect(
      commitScenarioAggregateMutation(recreated.project, {
        expectedRevision,
        editingHistory: checkpoint,
      })
    ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
    expect(stores).toEqual(before);
  }
});

it('refuses invalid checkpoint admission before changing any native store', async () => {
  const first = await commitScenarioAggregateMutation(
    createGuideProject('Current', 'invalid-checkpoint', 1)
  );
  const before = structuredClone(stores);
  const checkpoint = { version: 1 as const, past: [], future: [] };
  const options = { expectedRevision: first.workspaceRevision, editingHistory: checkpoint };
  for (const hostile of [
    null,
    { ...checkpoint, version: 2 },
    { ...checkpoint, future: [{ ...first.project, id: 'foreign' }] },
    { ...checkpoint, past: Array.from({ length: 1001 }, () => first.project) },
  ]) {
    Reflect.set(options, 'editingHistory', hostile);
    await expect(commitScenarioAggregateMutation(first.project, options)).rejects.toThrow(
      'checkpoint admission'
    );
    expect(stores).toEqual(before);
  }
  await expect(
    commitScenarioAggregateMutation(first.project, {
      editingHistory: checkpoint,
    })
  ).rejects.toThrow('checkpoint admission');
  await expect(
    commitScenarioAggregateMutation(first.project, {
      expectedRevision: first.workspaceRevision,
      editingHistory: checkpoint,
      children: {},
    })
  ).rejects.toThrow('checkpoint admission');
  expect(stores).toEqual(before);
});

it.each(['image', 'document'] as const)(
  'preserves history on a missing branch %s and permits retry after admission',
  async (kind) => {
    const project = createGuideProject('Current', 'resource-checkpoint', 1);
    const first = await commitScenarioAggregateMutation(
      project,
      kind === 'document'
        ? { children: { assetPuts: [createAsset(project.id, 'future-child')] } }
        : {}
    );
    const future = { ...first.project, items: [createGuideStep('Future image', 'step')] };
    future.items[0]!.blocks.push(
      createGuideImageBlock({
        id: 'future-image',
        assetId: 'future-child',
        ...(kind === 'document' ? { editDocumentId: 'future-document' } : {}),
        width: 10,
        height: 10,
        source: { kind: 'import', filename: 'future.png' },
      })
    );
    const checkpoint = { version: 1 as const, past: [], future: [future] };
    const before = structuredClone(stores);
    await expect(
      commitScenarioAggregateMutation(first.project, {
        expectedRevision: first.workspaceRevision,
        editingHistory: checkpoint,
      })
    ).rejects.toThrow();
    expect(stores).toEqual(before);
    const admitted = await commitScenarioAggregateMutation(first.project, {
      expectedRevision: first.workspaceRevision,
      children:
        kind === 'document'
          ? { editorDocumentPuts: [createDocument(first.project.id, 'future-document')] }
          : { assetPuts: [createAsset(first.project.id, 'future-child')] },
    });
    const result = await commitScenarioAggregateMutation(admitted.project, {
      expectedRevision: admitted.workspaceRevision,
      editingHistory: checkpoint,
    });
    expect((await getScenarioProjectEntry(first.project.id))?.editingHistory).toEqual(checkpoint);
    expect(result.editingHistory).toEqual(checkpoint);
  }
);

it('publishes changed content with its exact Undo and Redo branches', async () => {
  const first = await commitScenarioAggregateMutation(
    createGuideProject('Before', 'changed-checkpoint', 1)
  );
  const after = { ...first.project, name: 'After' };
  const checkpoint = { version: 1 as const, past: [first.project], future: [] };
  const second = await commitScenarioAggregateMutation(after, {
    expectedRevision: first.workspaceRevision,
    editingHistory: checkpoint,
  });
  const undo = await commitScenarioAggregateMutation(first.project, {
    expectedRevision: second.workspaceRevision,
    editingHistory: { version: 1, past: [], future: [second.project] },
  });
  const reopened = await getScenarioProjectEntry(first.project.id);
  expect(reopened?.project.name).toBe('Before');
  expect(reopened?.editingHistory?.past).toEqual([]);
  expect(reopened?.editingHistory?.future).toEqual([second.project]);
  expect(undo.editingHistory).toEqual(reopened?.editingHistory);
  const empty = await commitScenarioAggregateMutation(undo.project, {
    expectedRevision: undo.workspaceRevision,
    editingHistory: { version: 1, past: [], future: [] },
  });
  expect((await getScenarioProjectEntry(first.project.id))?.editingHistory).toEqual(
    empty.editingHistory
  );
  expect(empty.editingHistory).toEqual({ version: 1, past: [], future: [] });
});

it('appends generic native commands to the editing timeline and cuts the Redo branch', async () => {
  const first = await commitScenarioAggregateMutation(
    createGuideProject('Current', 'generic-checkpoint', 1)
  );
  const prior = { ...first.project, name: 'Past action' };
  const future = { ...first.project, name: 'Cancelled future' };
  const base = await commitScenarioAggregateMutation(first.project, {
    expectedRevision: first.workspaceRevision,
    editingHistory: { version: 1, past: [prior], future: [future] },
  });
  const next = await commitScenarioAggregateMutation(
    { ...base.project, name: 'Generic command' },
    {
      expectedRevision: base.workspaceRevision,
    }
  );
  expect(next.editingHistory).toEqual({ version: 1, past: [prior, base.project], future: [] });
  expect(await getScenarioEditingSnapshot(first.project.id)).toEqual(next);
  expect((await getScenarioProjectEntry(first.project.id))?.editingHistory).toEqual(
    next.editingHistory
  );
  expect(base.editingHistory?.future).toEqual([future]);
});

it('keeps autosave continuations in their existing action and separates the next action', async () => {
  const first = await commitScenarioAggregateMutation(
    createGuideProject('Initial', 'continued-checkpoint', 1)
  );
  const base = await commitScenarioAggregateMutation(first.project, {
    expectedRevision: first.workspaceRevision,
    editingHistory: { version: 1, past: [], future: [] },
  });
  const X = '11111111-1111-4111-8111-111111111111';
  const Y = '22222222-2222-4222-8222-222222222222';
  const intermediate = await commitScenarioAggregateMutation(
    { ...base.project, name: 'A' },
    {
      expectedRevision: base.workspaceRevision,
      historyActionId: X,
    }
  );
  const final = await commitScenarioAggregateMutation(
    { ...intermediate.project, name: 'AB' },
    {
      expectedRevision: intermediate.workspaceRevision,
      historyActionId: X,
    }
  );
  expect(final.editingHistory?.past).toEqual([base.project]);
  const next = await commitScenarioAggregateMutation(
    { ...final.project, tags: ['next'] },
    {
      expectedRevision: final.workspaceRevision,
      historyActionId: Y,
    }
  );
  expect(next.editingHistory?.past).toEqual([base.project, final.project]);
  expect((await getScenarioProjectEntry(first.project.id))?.editingHistory).toEqual(
    next.editingHistory
  );
});
