import { expect, it, vi } from 'vitest';

import { shouldRunDesignSystem } from './verify-focused-triggered.helpers.mjs';

it('runs design-system guardrail for design-system source-only changes', () => {
  expect(shouldRunDesignSystem(['apps/extension/src/design-system/shell/page/index.tsx'])).toBe(
    true
  );
  expect(shouldRunDesignSystem(['apps/extension/src/design-system/previews/layout.css'])).toBe(
    true
  );
});

it('uses one graph runner result for focused dependency graph steps', async () => {
  const module = await import('./verify-focused-triggered.execution.mjs');
  const graphRunner = vi.fn(async () => ({
    boundary: { output: '', exitCode: 0 },
    cycles: [],
  }));

  const steps = await module.runDependencyGraphTriggeredChecks(
    ['.dependency-cruiser.cjs'],
    graphRunner
  );

  expect(steps.map((step) => [step.label, step.status])).toContainEqual([
    'Dependency boundaries',
    'ok',
  ]);
  expect(steps.map((step) => [step.label, step.status])).toContainEqual(['Cycles', 'ok']);
  expect(graphRunner).toHaveBeenCalledTimes(1);
});

it('skips both focused graph steps when dependency graph is not triggered', async () => {
  const module = await import('./verify-focused-triggered.execution.mjs');
  const graphRunner = vi.fn();

  const steps = await module.runDependencyGraphTriggeredChecks(['README.md'], graphRunner);

  expect(steps.map((step) => [step.label, step.status])).toContainEqual([
    'Dependency boundaries',
    'skipped',
  ]);
  expect(steps.map((step) => [step.label, step.status])).toContainEqual(['Cycles', 'skipped']);
  expect(graphRunner).not.toHaveBeenCalled();
});
