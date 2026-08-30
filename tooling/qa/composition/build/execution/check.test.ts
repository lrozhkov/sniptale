import { expect, it, vi } from 'vitest';

function createBuildCollectors() {
  return {
    collectNamingStep: () => ({ label: 'Naming', status: 'ok' }),
    collectSecurityStep: async () => ({ label: 'HTML sanitizer ownership', status: 'ok' }),
    collectArchitectureGuardrailStep: () => ({ label: 'Architecture guardrails', status: 'ok' }),
    collectBoundaryStep: async () => ({ label: 'Dependency boundaries', status: 'ok' }),
    collectCycleStep: async () => ({ label: 'Cycles', status: 'ok' }),
    collectTypecheckStep: () => ({ label: 'Typecheck', status: 'ok' }),
    collectDeadExportsStep: () => ({ label: 'Dead exports', status: 'ok' }),
    collectManifestIntegrityStep: () => ({ label: 'Manifest integrity', status: 'ok' }),
    collectManifestPermissionsStep: () => ({ label: 'Manifest permissions', status: 'ok' }),
    collectRuntimeTopologyStep: () => ({ label: 'Runtime topology', status: 'ok' }),
    collectRootSideEffectsStep: () => ({ label: 'Root side effects', status: 'ok' }),
    collectUnitAndCoverageSteps: async () => [{ label: 'Unit tests', status: 'ok' }],
  };
}

function createContext() {
  return {
    codeFiles: ['src/example.ts'],
    targetFiles: ['src/example.ts'],
  };
}

it('blocks build closeout build step after earlier hardfail failures', async () => {
  const module = await import('./check.mjs');
  const buildCollector = vi.fn(async () => ({
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  }));

  const result = await module.collectBuildCloseoutStepResults({
    context: createContext(),
    collectors: {
      ...createBuildCollectors(),
      collectSecurityStep: async () => ({
        label: 'HTML sanitizer ownership',
        status: 'failed',
        summary: 'failed',
      }),
      collectBuildStep: buildCollector,
    },
  });

  expect(result.steps.at(-1)).toEqual({
    label: 'Build',
    status: 'blocked',
    detail: 'earlier hardfail steps failed',
  });
  expect(buildCollector).not.toHaveBeenCalled();
});

it('runs build closeout build step after earlier green steps', async () => {
  const module = await import('./check.mjs');
  const buildCollector = vi.fn(async () => ({
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 9,
  }));

  const result = await module.collectBuildCloseoutStepResults({
    context: createContext(),
    collectors: {
      ...createBuildCollectors(),
      collectBuildStep: buildCollector,
    },
  });

  expect(result.steps.at(-1)).toEqual({
    label: 'Build',
    status: 'ok',
    detail: '',
    durationMs: 9,
  });
  expect(buildCollector).toHaveBeenCalledTimes(1);
});

it('blocks the Vite build when the Vitest step fails', async () => {
  const module = await import('./check.mjs');
  const buildCollector = vi.fn(async () => ({
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  }));

  const result = await module.collectBuildCloseoutStepResults({
    context: createContext(),
    collectors: {
      ...createBuildCollectors(),
      collectUnitAndCoverageSteps: async () => [
        { label: 'Unit tests', status: 'failed' as const, summary: 'Vitest failed' },
      ],
      collectBuildStep: buildCollector,
    },
  });

  expect(result.steps.at(-1)).toEqual({
    label: 'Build',
    status: 'blocked',
    detail: 'earlier hardfail steps failed',
  });
  expect(buildCollector).not.toHaveBeenCalled();
});

it('accepts one dependency graph collector for both build graph steps', async () => {
  const module = await import('./check.mjs');
  const graphCollector = vi.fn(async () => [
    { label: 'Dependency boundaries', status: 'ok' as const },
    { label: 'Cycles', status: 'ok' as const },
  ]);

  const result = await module.collectBuildCloseoutStepResults({
    context: createContext(),
    collectors: {
      ...createBuildCollectors(),
      collectDependencyGraphSteps: graphCollector,
      collectBuildStep: async () => ({ label: 'Build', status: 'ok' as const }),
    },
  });

  expect(result.steps.map((step) => step.label)).toEqual([
    'Naming',
    'HTML sanitizer ownership',
    'Architecture guardrails',
    'Dependency boundaries',
    'Cycles',
    'Root side effects',
    'Typecheck',
    'Unit tests',
    'Build',
  ]);
  expect(graphCollector).toHaveBeenCalledTimes(1);
});

it('keeps the cycles step visible when dependency boundaries fail in build closeout', async () => {
  const module = await import('./check.mjs');

  const result = await module.collectBuildCloseoutStepResults({
    context: createContext(),
    collectors: {
      ...createBuildCollectors(),
      collectDependencyGraphSteps: async () => [
        { label: 'Dependency boundaries', status: 'failed' as const, summary: 'failed' },
        { label: 'Cycles', status: 'ok' as const },
      ],
    },
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['Naming', 'ok'],
    ['HTML sanitizer ownership', 'ok'],
    ['Architecture guardrails', 'ok'],
    ['Dependency boundaries', 'failed'],
    ['Cycles', 'ok'],
    ['Root side effects', 'ok'],
    ['Typecheck', 'ok'],
    ['Unit tests', 'ok'],
    ['Build', 'blocked'],
  ]);
});
