import fs from 'node:fs';

import { expect, it } from 'vitest';

import { VERIFY_ALL_VIOLATION_STEPS } from '../verify-all.violation-steps.mjs';
import { FOCUSED_CODE_VIOLATION_STEPS } from '../verify-focused.code-steps.mjs';
import { FOCUSED_TRIGGERED_STEP_DEFINITIONS } from '../verify-focused-triggered.helpers.mjs';
import {
  QA_RULE_DEFINITIONS,
  QA_STEP_OCCURRENCES,
  collectQaStepDefinitionsByLane,
  collectRegisteredQaTools,
} from './definitions.mjs';

function labels(entries: { label: string }[]) {
  return entries.map(({ label }) => label);
}

it('covers executable focused and release guardrail definitions without a shadow registry', () => {
  const lanes = collectQaStepDefinitionsByLane();

  expect(labels(lanes['release-guardrail'])).toEqual(
    VERIFY_ALL_VIOLATION_STEPS.map(([label]) => label)
  );
  expect(labels(lanes['focused-guardrail'])).toEqual(
    FOCUSED_CODE_VIOLATION_STEPS.map(([label]) => label)
  );
  expect(labels(lanes['focused-triggered'])).toEqual(
    FOCUSED_TRIGGERED_STEP_DEFINITIONS.map(({ label }) => label)
  );
});

it('records every canonical wrapper and decision lane', () => {
  expect(Object.keys(collectQaStepDefinitionsByLane()).sort()).toEqual([
    'advisory',
    'audit',
    'build',
    'build-commit',
    'closeout',
    'e2e',
    'focused-direct',
    'focused-guardrail',
    'focused-triggered',
    'harness',
    'manual',
    'release-direct',
    'release-guardrail',
    'wrapper-lifecycle',
  ]);
});

it('keeps core owner and release controls in focused conditional proof', () => {
  const triggered = collectQaStepDefinitionsByLane()['focused-triggered'];
  const expected = [
    ['qa.rule.package-boundaries', 'verify-package-boundaries.mjs'],
    ['qa.rule.app-core-owners', 'verify-app-core-owners.mjs'],
    ['qa.rule.target-only-paths', 'verify-target-only-paths.mjs'],
    ['qa.rule.oss-release-surface', 'verify-oss-release-surface.mjs'],
  ];

  for (const [id, tool] of expected) {
    expect(triggered).toContainEqual(
      expect.objectContaining({ id, tool, execution: 'always', status: 'blocking' })
    );
  }
});

it('covers wrapper lifecycle, reuse, help, no-target and e2e emitted steps', () => {
  const lanes = collectQaStepDefinitionsByLane();

  expect(labels(lanes.closeout)).toEqual(['QA checkpoint', 'Full build']);
  expect(labels(lanes.e2e)).toEqual(['E2E build', 'Playwright']);
  expect(labels(lanes['wrapper-lifecycle'])).toEqual(
    expect.arrayContaining([
      'QA preflight',
      'QA checkpoint',
      'QA build',
      'QA release harness',
      'Wrapper help',
      'No applicable targets',
    ])
  );
});

it('assigns lifecycle occurrences only to wrappers that can emit them', () => {
  const lifecycle = collectQaStepDefinitionsByLane()['wrapper-lifecycle'];
  expect(lifecycle.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      'qa.rule.wrapper-lifecycle',
      'qa.rule.wrapper-interruption',
      'qa.rule.wrapper-stale-run-recovery',
    ])
  );
  expect(lifecycle.find(({ label }) => label === 'QA preflight')?.runsIn).toEqual(['qa:preflight']);
  expect(lifecycle.find(({ label }) => label === 'QA release harness')?.runsIn).toEqual([
    'qa:release-harness',
  ]);
  expect(lifecycle.find(({ label }) => label === 'Harness QA')?.runsIn).toEqual(['qa:checkpoint']);
});

it('gives every occurrence stable rule/tool identity and actionable policy metadata', () => {
  const allowedKinds = new Set(['advisory', 'guardrail', 'manual', 'tool']);
  const allowedExecution = new Set(['advisory', 'always', 'conditional', 'manual']);

  for (const step of QA_STEP_OCCURRENCES) {
    expect(step.id).toMatch(/^qa\.rule\.[a-z0-9-]+$/u);
    expect(step.toolId).toMatch(/^qa\.tool\.[a-z0-9-]+$/u);
    expect(allowedKinds.has(step.kind)).toBe(true);
    expect(allowedExecution.has(step.execution)).toBe(true);
    expect(step.skipPolicy.mustReport).toBe(true);
    expect(step.skipPolicy.allowedReason.length).toBeGreaterThan(0);
    expect(step.label.length).toBeGreaterThan(0);
    expect(step.tool.length).toBeGreaterThan(0);
    expect(step.owner.length).toBeGreaterThan(0);
    expect(step.truthSource.length).toBeGreaterThan(0);
    expect(step.remediation.length).toBeGreaterThan(40);
    expect(step.ruleDoc).toMatch(/\.md(?:#|$)/u);
    expect(step.runsIn.length).toBeGreaterThan(0);
    if (step.source !== 'git') expect(fs.existsSync(step.source)).toBe(true);
  }
});

it('merges shared controls by stable id without losing lane evidence', () => {
  const typecheck = QA_RULE_DEFINITIONS.find(({ id }) => id === 'qa.rule.typecheck');
  const interfaceSurfaces = QA_RULE_DEFINITIONS.find(
    ({ id }) => id === 'qa.rule.interface-surfaces'
  );
  const returnedObjects = QA_RULE_DEFINITIONS.find(
    ({ id }) => id === 'qa.rule.returned-object-surfaces'
  );

  expect(typecheck?.lanes).toEqual(
    expect.arrayContaining(['release-direct', 'focused-triggered', 'harness', 'build'])
  );
  expect(interfaceSurfaces?.toolId).toBe(returnedObjects?.toolId);
  expect(interfaceSurfaces?.id).not.toBe(returnedObjects?.id);
  expect(new Set(QA_RULE_DEFINITIONS.map(({ id }) => id)).size).toBe(QA_RULE_DEFINITIONS.length);
});

it('exposes the same registered tool population used by the coverage contract', () => {
  expect([...collectRegisteredQaTools()].sort()).toEqual(
    [...new Set(QA_STEP_OCCURRENCES.map(({ tool }) => tool))].sort()
  );
});
