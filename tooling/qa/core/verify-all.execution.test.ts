import { expect, it, vi } from 'vitest';

function createAggregateCollectors() {
  return {
    collectLineLengthStep: () => ({ label: 'Changed-line readability', status: 'ok' }),
    collectOxlintStep: () => ({ label: 'Oxlint', status: 'ok' }),
    collectEslintStep: async () => ({ label: 'ESLint', status: 'ok' }),
    collectSonarjsReleaseStep: async () => ({ label: 'SonarJS', status: 'ok' }),
    collectAiLimitsStep: () => ({ label: 'AI limits', status: 'ok' }),
    collectNamingStep: () => ({ label: 'Naming', status: 'ok' }),
    collectViolationSteps: () => [],
    collectI18nStep: () => ({ label: 'i18n', status: 'ok' }),
    collectDesignSystemStep: () => ({ label: 'Design system', status: 'ok' }),
    collectAuditStep: () => ({ label: 'Audit', status: 'ok' }),
    collectSecurityStep: async () => ({ label: 'Security', status: 'ok' }),
    collectBoundaryStep: async () => ({ label: 'Dependency boundaries', status: 'ok' }),
    collectCycleStep: async () => ({ label: 'Cycles', status: 'ok' }),
    collectTypecheckStep: () => ({ label: 'Typecheck', status: 'ok' }),
    collectDeadExportsStep: () => ({ label: 'Dead exports', status: 'ok' }),
    collectUnitAndCoverageSteps: async () => [
      { label: 'Unit tests', status: 'ok' },
      { label: 'Test coverage', status: 'ok' },
    ],
    collectReleaseArchiveStep: async () => ({ label: 'Release archive', status: 'ok' }),
  };
}

function createVerifyScope() {
  return {
    targetFiles: ['src/example.ts'],
    codeFiles: ['src/example.ts'],
  };
}

function collectFailedReleaseStatuses(result) {
  return result.steps.map((step) => [step.label, step.status]);
}

function createHardfailCollectors(buildCollector) {
  return {
    ...createAggregateCollectors(),
    collectEslintStep: async () => ({
      label: 'ESLint',
      status: 'failed',
      summary: 'failed',
    }),
    collectNamingStep: () => ({
      label: 'Naming',
      status: 'failed',
      summary: 'violations found',
    }),
    collectViolationSteps: () => [{ label: 'Messaging', status: 'ok' }],
    collectUnitAndCoverageSteps: async () => [
      { label: 'Unit tests', status: 'failed', summary: 'failed' },
      { label: 'Test coverage', status: 'skipped', detail: 'skipped: unit tests failed' },
    ],
    collectBuildStep: buildCollector,
  };
}

it('aggregates release hardfail steps and skips build after earlier failures', async () => {
  const module = await import('./verify-all.execution.mjs');
  const buildCollector = vi.fn(async () => ({
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  }));

  const result = await module.collectFullVerifyStepResults({
    releaseMode: true,
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: createHardfailCollectors(buildCollector),
  });

  expect(result.scopeDetail).toBe('release full-suite tests without coverage');
  expect(collectFailedReleaseStatuses(result)).toEqual([
    ['Changed-line readability', 'ok'],
    ['Oxlint', 'ok'],
    ['ESLint', 'failed'],
    ['SonarJS', 'ok'],
    ['AI limits', 'ok'],
    ['Naming', 'failed'],
    ['Messaging', 'ok'],
    ['i18n', 'ok'],
    ['Design system', 'ok'],
    ['Audit', 'ok'],
    ['Security', 'ok'],
    ['Dependency boundaries', 'ok'],
    ['Cycles', 'ok'],
    ['Typecheck', 'ok'],
    ['Dead exports', 'ok'],
    ['Unit tests', 'failed'],
    ['Test coverage', 'skipped'],
    ['Build', 'blocked'],
    ['Release archive', 'blocked'],
  ]);
  expect(result.steps.at(-2)?.detail).toContain('earlier hardfail steps failed');
  expect(result.steps.at(-1)?.detail).toContain('release build did not complete');
  expect(buildCollector).not.toHaveBeenCalled();
});

it('runs build in release mode when all prior steps are green', async () => {
  const module = await import('./verify-all.execution.mjs');
  const buildCollector = vi.fn(async () => ({
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 12,
  }));

  const result = await module.collectFullVerifyStepResults({
    releaseMode: false,
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: {
      ...createAggregateCollectors(),
      collectBuildStep: buildCollector,
    },
  });

  expect(result.scopeDetail).toContain('diff-based related tests');
  expect(result.steps.at(-1)).toEqual({
    label: 'Build',
    status: 'ok',
    detail: '',
    durationMs: 12,
  });
  expect(buildCollector).toHaveBeenCalledTimes(1);
});

it('packages the release archive after a green release build', async () => {
  const module = await import('./verify-all.execution.mjs');
  const buildCollector = vi.fn(async () => ({
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 12,
  }));
  const archiveCollector = vi.fn(async () => ({
    label: 'Release archive',
    status: 'ok' as const,
    detail: 'Release archive: build/sniptale.zip',
    durationMs: 4,
  }));

  const result = await module.collectFullVerifyStepResults({
    releaseMode: true,
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: {
      ...createAggregateCollectors(),
      collectBuildStep: buildCollector,
      collectReleaseArchiveStep: archiveCollector,
    },
  });

  expect(result.steps.slice(-2)).toEqual([
    { label: 'Build', status: 'ok', detail: '', durationMs: 12 },
    {
      label: 'Release archive',
      status: 'ok',
      detail: 'Release archive: build/sniptale.zip',
      durationMs: 4,
    },
  ]);
  expect(archiveCollector).toHaveBeenCalledTimes(1);
});

it('accepts one dependency graph collector while preserving release step order', async () => {
  const module = await import('./verify-all.execution.mjs');
  const graphCollector = vi.fn(async () => [
    { label: 'Dependency boundaries', status: 'ok' as const },
    { label: 'Cycles', status: 'ok' as const },
  ]);

  const result = await module.collectFullVerifyStepResults({
    releaseMode: false,
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: {
      ...createAggregateCollectors(),
      collectDependencyGraphSteps: graphCollector,
      collectBuildStep: async () => ({ label: 'Build', status: 'ok' as const }),
    },
  });

  expect(result.steps.map((step) => step.label)).toEqual([
    'Changed-line readability',
    'Oxlint',
    'ESLint',
    'AI limits',
    'Naming',
    'i18n',
    'Design system',
    'Audit',
    'Security',
    'Dependency boundaries',
    'Cycles',
    'Typecheck',
    'Dead exports',
    'Unit tests',
    'Test coverage',
    'Build',
  ]);
  expect(graphCollector).toHaveBeenCalledTimes(1);
});

it('keeps SonarJS release-only in the full verification collector', async () => {
  const module = await import('./verify-all.execution.mjs');
  const sonarjsCollector = vi.fn(async () => ({ label: 'SonarJS', status: 'ok' as const }));

  const closeoutResult = await module.collectFullVerifyStepResults({
    releaseMode: false,
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: {
      ...createAggregateCollectors(),
      collectBuildStep: async () => ({ label: 'Build', status: 'ok' as const }),
      collectSonarjsReleaseStep: sonarjsCollector,
    },
  });
  const releaseResult = await module.collectFullVerifyStepResults({
    releaseMode: true,
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: {
      ...createAggregateCollectors(),
      collectBuildStep: async () => ({ label: 'Build', status: 'ok' as const }),
      collectSonarjsReleaseStep: sonarjsCollector,
    },
  });

  expect(closeoutResult.steps.map((step) => step.label)).not.toContain('SonarJS');
  expect(releaseResult.steps.map((step) => step.label)).toContain('SonarJS');
  expect(sonarjsCollector).toHaveBeenCalledTimes(1);
});
