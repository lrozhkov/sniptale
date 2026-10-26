import { describe, expect, it } from 'vitest';
import type { AIModel } from '../../../contracts/settings';
import type { AICatalogFacts } from '../../../contracts/settings/ai-catalog';
import { supportsAIModelOperation } from '../../../contracts/settings/model-operation';
import { reconcileManagedCatalog } from './catalog-reconciliation';

const DAY = 24 * 60 * 60 * 1000;
const facts: AICatalogFacts = {
  displayName: 'Model',
  observedAt: 1,
  lifecycle: 'active',
  capabilities: {
    operations: { text: 'supported', transcription: 'supported' },
    input: {},
    output: {},
    features: {},
  },
};
function run(
  models: AIModel[],
  observations = [{ modelCode: 'remote', facts }],
  now = 1,
  complete = true,
  referencedModelIds = new Set<string>()
) {
  return reconcileManagedCatalog({
    providerId: 'p',
    scope: 'scope',
    models,
    observations,
    now,
    complete,
    referencedModelIds,
    createId: () => 'stable-id',
  });
}

describe('managed catalog reconciliation', () => {
  it('adds one stable multi-operation record and does not rewrite equal facts on refresh', () => {
    const first = run([]);
    expect(first.added).toBe(1);
    const model = first.models[0]!;
    expect(supportsAIModelOperation(model, 'text')).toBe(true);
    expect(supportsAIModelOperation(model, 'transcription')).toBe(true);
    const next = run(
      first.models,
      [{ modelCode: 'remote', facts: { ...facts, observedAt: 2 } }],
      2
    );
    expect(next.models[0]).toBe(model);
    expect(next.updated).toBe(0);
  });

  it('preserves manual properties, enabled state, and identity while updating provider facts', () => {
    const model = {
      ...run([]).models[0]!,
      source: 'manual' as const,
      displayName: 'My name',
      enabled: false,
    };
    const next = run(
      [model],
      [
        {
          modelCode: 'remote',
          facts: { ...facts, displayName: 'New provider name', observedAt: 2 },
        },
      ],
      2
    );
    expect(next.models[0]).toMatchObject({
      id: 'stable-id',
      source: 'manual',
      displayName: 'My name',
      enabled: false,
      catalog: { displayName: 'New provider name' },
    });
  });

  it('does not advance absence evidence for partial results or multiple reads in one day', () => {
    const model = run([]).models[0]!;
    expect(run([model], [], 2, false).models[0]).toBe(model);
    const firstAbsence = run([model], [], 2).models;
    expect(firstAbsence[0]?.catalog?.absenceCount).toBe(1);
    expect(supportsAIModelOperation(firstAbsence[0]!, 'text')).toBe(true);
    expect(run(firstAbsence, [], 3).models[0]).toBe(firstAbsence[0]);
    const secondAbsence = run(firstAbsence, [], DAY + 2).models;
    expect(secondAbsence[0]?.catalog?.absenceCount).toBe(2);
    expect(supportsAIModelOperation(secondAbsence[0]!, 'text')).toBe(false);
  });

  it('does not carry absence evidence or automatic capability claims across credential scopes', () => {
    const model = {
      ...run(run([]).models, [], 2).models[0]!,
      catalog: {
        ...run([]).models[0]!.catalog!,
        scope: 'previous-credential',
        absenceCount: 2,
        firstAbsentAt: 1,
        lastAbsentAt: 2,
      },
    };
    const changed = run([model], [], 40 * DAY).models[0]!;
    expect(changed.id).toBe(model.id);
    expect(changed.catalog).toMatchObject({ scope: 'scope', lifecycle: 'unknown' });
    expect(changed.catalog).not.toHaveProperty('absenceCount');
    expect(supportsAIModelOperation(changed, 'text')).toBe(false);
    expect(run([changed], [], 40 * DAY + 1).models[0]!.catalog?.absenceCount).toBe(1);
  });

  it('preserves referenced tombstones and manual overrides during thirty-day cleanup', () => {
    const missing = run(run([]).models, [], 2).models;
    expect(run(missing, [], 31 * DAY).deleted).toBe(1);
    expect(run(missing, [], 31 * DAY, true, new Set(['stable-id'])).deleted).toBe(0);
    expect(run([{ ...missing[0]!, source: 'manual' }], [], 31 * DAY).deleted).toBe(0);
  });

  it('restores the same identity on reappearance and requires explicit manual retirement override', () => {
    const original = run([]).models;
    const absent = run(original, [], 2).models;
    expect(run(absent).models[0]).toMatchObject({
      id: 'stable-id',
      catalog: { lifecycle: 'active' },
    });
    const retired = run(original, [
      { modelCode: 'remote', facts: { ...facts, lifecycle: 'retired' } },
    ]).models[0]!;
    expect(supportsAIModelOperation(retired, 'text')).toBe(false);
    expect(
      supportsAIModelOperation({ ...retired, source: 'manual', retirementOverride: true }, 'text')
    ).toBe(true);
    expect(
      supportsAIModelOperation(
        { ...retired, source: 'manual', retirementOverride: true, enabled: false },
        'text'
      )
    ).toBe(false);
  });
});

it('updates every manual profile for the same exact remote ID without inventing absence', () => {
  const first = run([]).models[0]!;
  const profiles = [
    { ...first, source: 'manual' as const, displayName: 'Profile one' },
    { ...first, id: 'profile-two', source: 'manual' as const, displayName: 'Profile two' },
  ];
  const refreshed = run(
    profiles,
    [
      {
        modelCode: 'remote',
        facts: { ...facts, observedAt: 2, displayName: 'Provider renamed model' },
      },
    ],
    2
  );
  expect(refreshed.models.map((model) => model.displayName)).toEqual([
    'Profile one',
    'Profile two',
  ]);
  expect(refreshed.models.every((model) => model.catalog?.lifecycle === 'active')).toBe(true);
  expect(
    refreshed.models.every((model) => model.catalog?.displayName === 'Provider renamed model')
  ).toBe(true);
  expect(refreshed.added).toBe(0);
});
