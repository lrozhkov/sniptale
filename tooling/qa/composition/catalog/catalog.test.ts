import { describe, expect, it } from 'vitest';

import {
  QA_CONTROL_CATALOG,
  assertAdapterClosure,
  collectCiClosureReport,
  collectQaOccurrences,
  orderQaResultSteps,
  projectExecutionLabels,
} from './catalog.mjs';
import { QA_CATEGORY_ORDER } from './category-profiles.mjs';
import {
  assertQaSchedulerCapacityClosure,
  projectQaSchedulerLanes,
  validateQaSchedulerCatalog,
} from './scheduler-profiles.mjs';

const semanticClasses = new Set([
  'semantic guard / analyzer',
  'manual semantic control',
  'proof/build/test/tool',
  'wrapper / CI composition',
  'audit/report projection',
]);

describe('canonical QA control catalog', () => {
  it('owns every retained identity once with complete execution and proof metadata', () => {
    expect(QA_CONTROL_CATALOG.length).toBeGreaterThan(0);
    expect(new Set(QA_CONTROL_CATALOG.map(({ id }) => id)).size).toBe(QA_CONTROL_CATALOG.length);
    expect(QA_CONTROL_CATALOG.map(({ id }) => id)).not.toContain(
      'qa.rule.runtime-response-privacy'
    );
    expect(QA_CONTROL_CATALOG.map(({ id }) => id)).not.toContain('qa.rule.stats-counter-semantics');

    for (const control of QA_CONTROL_CATALOG) {
      expect(semanticClasses.has(control.semanticClass), control.id).toBe(true);
      expect(QA_CATEGORY_ORDER[control.category], control.id).toBeTypeOf('number');
      expect(control.occurrences.length, control.id).toBeGreaterThan(0);
      expect(control.proof.evidenceStatus, control.id).toBe('derived-closure');
      expect(control.scopeProfile, control.id).not.toBe('');
      expect(control.engineDecision.rationale, control.id).not.toBe('');
      expect(control.resourceProfile, control.id).not.toBe('');
      expect(control.normalizationProfile, control.id).toBe('qa-step-result-v1');
      expect(control).toHaveProperty('ciDisposition');
    }
  });

  it('reports checkpoint controls without a CI disposition without blocking catalog loading', () => {
    const report = collectCiClosureReport();
    expect(report).toMatchObject({
      artifactKind: 'sniptale-ci-closure-report',
      blocking: false,
    });
    expect(report.controls.length).toBeGreaterThan(0);
    expect(report.gaps).toEqual(
      report.controls
        .filter(({ ciDisposition }) => ciDisposition === null)
        .map(({ id, label }) => ({ id, label }))
    );
    expect(
      collectCiClosureReport([
        {
          id: 'qa.rule.new-control',
          label: 'New control',
          lanes: ['focused-triggered'],
          ciDisposition: null,
        },
      ]).gaps
    ).toEqual([{ id: 'qa.rule.new-control', label: 'New control' }]);
  });

  it('requires manual reports to name one exact canonical control identity', async () => {
    const [{ createManualOccurrences }, { createQaStepOccurrence }] = await Promise.all([
      import('./catalog.mjs'),
      import('./policy/index.mjs'),
    ]);
    const canonical = [
      createQaStepOccurrence({
        id: 'first',
        kind: 'guardrail',
        label: 'First',
        lane: 'focused-guardrail',
        source: 'tooling/qa/composition/catalog/catalog.mjs',
        tool: 'shared.mjs',
      }),
      createQaStepOccurrence({
        id: 'second',
        kind: 'guardrail',
        label: 'Second',
        lane: 'focused-guardrail',
        source: 'tooling/qa/composition/catalog/catalog.mjs',
        tool: 'shared.mjs',
      }),
    ];

    expect(
      createManualOccurrences(canonical, [
        { controlId: 'qa.rule.first', tool: 'shared.mjs' },
        { controlId: 'qa.rule.second', tool: 'shared.mjs' },
      ]).map(({ id }) => id)
    ).toEqual(['qa.rule.first', 'qa.rule.second']);
    expect(() => createManualOccurrences(canonical, [{ tool: 'shared.mjs' }])).toThrow(
      /no explicit control id/u
    );
    expect(() =>
      createManualOccurrences(canonical, [{ controlId: 'qa.rule.missing', tool: 'shared.mjs' }])
    ).toThrow(/unknown control/u);
  });

  it('derives preparation, admission and guard dependencies from category policy', () => {
    const format = QA_CONTROL_CATALOG.find(({ label }) => label === 'Format');
    const admission = QA_CONTROL_CATALOG.find(({ label }) => label === 'Task artifacts');
    const guards = QA_CONTROL_CATALOG.filter(
      ({ category }) => !['preparation', 'scope-and-admission', 'orchestration'].includes(category)
    );

    expect(format?.dependencyProfiles).toEqual([]);
    expect(admission?.dependencyProfiles).toEqual(['preparation']);
    expect(
      guards.every(({ dependencyProfiles }) => dependencyProfiles.includes('scope-and-admission'))
    ).toBe(true);
  });

  it('rejects missing and unknown executable adapters', () => {
    const occurrences = collectQaOccurrences({ lane: 'focused-direct' });
    const exact = new Map(occurrences.map(({ id }) => [id, () => undefined]));
    expect(() => assertAdapterClosure(exact, 'focused-direct')).not.toThrow();

    exact.delete(occurrences[0]!.id);
    exact.set('qa.rule.unknown-adapter', () => undefined);
    expect(() => assertAdapterClosure(exact, 'focused-direct')).toThrow(/missing=.*unknown=/u);
  });

  it('normalizes result display independently of completion order', () => {
    const projectedLabels = projectExecutionLabels('focused-direct');
    const labels = QA_CONTROL_CATALOG.filter(({ label }) => projectedLabels.includes(label)).map(
      ({ label }) => label
    );
    const completedInReverse = labels.toReversed().map((label) => ({ label, status: 'ok' }));
    expect(orderQaResultSteps(completedInReverse).map(({ label }) => label)).toEqual(labels);
  });

  it('projects focused and full scheduler membership, resources, dependencies and triggers', () => {
    const focused = projectQaSchedulerLanes({ mode: 'focused' });
    const full = projectQaSchedulerLanes({ mode: 'full', releaseMode: false });

    expect(focused.map(({ lane }) => lane)).toEqual([
      'light',
      'lint',
      'appOwners',
      'targetPaths',
      'graph',
      'typecheck',
      'tests',
    ]);
    expect(full.find(({ lane }) => lane === 'typecheck')?.dependencies).toEqual(['lint']);
    expect(full.find(({ lane }) => lane === 'graph')?.dependencies).toEqual(['lint', 'typecheck']);
    for (const profile of [...focused, ...full]) {
      expect(profile.controls.length, profile.lane).toBeGreaterThan(0);
      expect(profile.resources.memoryMiB, profile.lane).toBeGreaterThan(0);
      expect(profile.resourceClasses.length, profile.lane).toBeGreaterThan(0);
      expect(profile.triggerProfiles.length, profile.lane).toBeGreaterThan(0);
    }
    expect(() =>
      validateQaSchedulerCatalog([{ id: 'qa.rule.missing', resourceProfile: 'io-light' }])
    ).toThrow('QA scheduler metadata missing');
    expect(() =>
      assertQaSchedulerCapacityClosure(['light'], { light: {}, stale: {} }, 'focused')
    ).toThrow('QA scheduler capacity profile drift');
  });
});
