import { expect, it, vi } from 'vitest';

function createAggregateCollectors() {
  return {
    collectFormatStep: () => ({ label: 'Format', status: 'ok' }),
    collectLineLengthStep: () => ({ label: 'Changed-line readability', status: 'ok' }),
    collectRepositoryReadabilityStep: () => ({ label: 'Repository readability', status: 'ok' }),
    collectOxlintStep: () => ({ label: 'Oxlint', status: 'ok' }),
    collectDeadCommentedCodeStep: () => ({ label: 'Dead commented code', status: 'ok' }),
    collectStructuralRiskStep: () => ({ label: 'Structural risk', status: 'ok' }),
    collectNamingStep: () => ({ label: 'Naming', status: 'ok' }),
    collectMockParityStep: () => ({ label: 'Mock export parity', status: 'ok' }),
    collectViolationSteps: () => [],
    collectI18nStep: () => ({ label: 'i18n', status: 'ok' }),
    collectDesignSystemStep: () => ({ label: 'Design system', status: 'ok' }),
    collectSecurityStep: async () => ({ label: 'HTML sanitizer ownership', status: 'ok' }),
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

it('uses the candidate diff scope for structural risk in release mode', async () => {
  const module = await import('./execution.mjs');
  const collectStructuralRiskStep = vi.fn(() => ({
    label: 'Structural risk',
    status: 'ok' as const,
  }));

  await module.collectFullVerifyStepResults({
    includeArtifactSteps: false,
    includeTests: false,
    releaseMode: true,
    verifyScope: {
      targetFiles: ['src/changed.ts', 'src/unchanged.ts'],
      codeFiles: ['src/changed.ts', 'src/unchanged.ts'],
      structuralCodeFiles: ['src/changed.ts'],
      structuralComparisonRevision: 'a'.repeat(40),
      structuralDeletedFiles: ['src/removed.ts'],
    },
    baseline: [],
    collectors: { ...createAggregateCollectors(), collectStructuralRiskStep },
  });

  expect(collectStructuralRiskStep).toHaveBeenCalledWith(
    expect.objectContaining({
      codeFiles: ['src/changed.ts', 'src/unchanged.ts'],
      structuralCodeFiles: ['src/changed.ts'],
      structuralComparisonRevision: 'a'.repeat(40),
      structuralDeletedFiles: ['src/removed.ts'],
      releaseMode: true,
    })
  );
});

function collectFailedReleaseStatuses(result) {
  return result.steps.map((step) => [step.label, step.status]);
}

function createHardfailCollectors(buildCollector) {
  return {
    ...createAggregateCollectors(),
    collectOxlintStep: () => ({
      label: 'Oxlint',
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
  const module = await import('./execution.mjs');
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
    ['Format', 'ok'],
    ['Changed-line readability', 'ok'],
    ['Repository readability', 'ok'],
    ['Oxlint', 'failed'],
    ['Dead commented code', 'ok'],
    ['Structural risk', 'ok'],
    ['Naming', 'failed'],
    ['Mock export parity', 'ok'],
    ['Messaging', 'ok'],
    ['i18n', 'ok'],
    ['Design system', 'ok'],
    ['HTML sanitizer ownership', 'ok'],
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
  const module = await import('./execution.mjs');
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
  const module = await import('./execution.mjs');
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

it('runs only release artifact owners after verified Fast proof admission', async () => {
  const module = await import('./execution.mjs');
  const buildCollector = vi.fn(async () => ({ label: 'Build', status: 'ok' as const }));
  const archiveCollector = vi.fn(async () => ({
    label: 'Release archive',
    status: 'ok' as const,
  }));

  const result = await module.collectReleaseDeltaStepResults({
    verifyScope: createVerifyScope(),
    baseline: [],
    collectors: {
      collectBuildStep: buildCollector,
      collectReleaseArchiveStep: archiveCollector,
    },
  });

  expect(result.steps.map(({ label }) => label)).toEqual(['Build', 'Release archive']);
  expect(buildCollector).toHaveBeenCalledTimes(1);
  expect(archiveCollector).toHaveBeenCalledTimes(1);
});

it('omits release artifact owners when their delta is explicitly excluded', async () => {
  const module = await import('./execution.mjs');
  const buildCollector = vi.fn();
  const archiveCollector = vi.fn();

  const result = await module.collectReleaseDeltaStepResults({
    verifyScope: createVerifyScope(),
    baseline: [],
    includeArtifactSteps: false,
    collectors: {
      collectBuildStep: buildCollector,
      collectReleaseArchiveStep: archiveCollector,
    },
  });

  expect(result.steps).toEqual([]);
  expect(buildCollector).not.toHaveBeenCalled();
  expect(archiveCollector).not.toHaveBeenCalled();
});

it('accepts one dependency graph collector while preserving release step order', async () => {
  const module = await import('./execution.mjs');
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
    'Dead commented code',
    'Structural risk',
    'Naming',
    'i18n',
    'Design system',
    'HTML sanitizer ownership',
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

it('keeps Oxlint and security as independent release owners', async () => {
  const module = await import('./execution.mjs');
  const oxlintCollector = vi.fn(() => ({ label: 'Oxlint', status: 'ok' as const }));
  const securityCollector = vi.fn(async () => ({
    label: 'HTML sanitizer ownership',
    status: 'ok' as const,
  }));

  const result = await module.collectReleaseLintLane(
    {
      codeFiles: ['apps/extension/src/example.ts'],
      releaseMode: true,
      targetFiles: ['apps/extension/src/example.ts'],
    },
    {
      oxlintCollector,
      securityCollector,
    }
  );

  expect(oxlintCollector).toHaveBeenCalledTimes(1);
  expect(securityCollector).toHaveBeenCalledWith(
    expect.not.objectContaining({ eslintResults: expect.anything() })
  );
  expect([result.oxlintStep.label, result.securityStep.label]).toEqual([
    'Oxlint',
    'HTML sanitizer ownership',
  ]);
});

it('keeps full verification security repo-wide without a shared lint result bag', async () => {
  const module = await import('./catalog/audit-steps.mjs');
  const securityCollector = vi.fn(async () => ({
    label: 'HTML sanitizer ownership',
    status: 'ok' as const,
  }));
  const codeFiles = ['tooling/qa/core/example.mjs'];

  await module.collectOptionalSecurityStep({ codeFiles }, { securityCollector });
  expect(securityCollector).toHaveBeenLastCalledWith();
  expect(securityCollector).toHaveBeenCalledTimes(1);
});
