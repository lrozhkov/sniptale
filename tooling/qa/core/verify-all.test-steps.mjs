import { runDependencyGraphCheck } from './dependency-graph-runner.mjs';
import { createFailureStep, createOkStep } from './focused-qa-results.mjs';
import {
  recordSuccessfulBoundaryCheck,
  recordSuccessfulCycleCheck,
  resolveReusableBoundaryCheck,
  resolveReusableCycleCheck,
} from './dependency-graph-cache.mjs';
import { FULL_TYPECHECK_PROJECT_IDS } from './typecheck-project-map.mjs';
import {
  recordSuccessfulTypecheck,
  resolveReusableTypecheckState,
} from './verify-typecheck-cache.mjs';
import { runTypecheck } from './verify-typecheck.mjs';
import { measureAsyncStep, measureSyncStep } from './step-timing.helpers.mjs';
export { collectUnitTestAndCoverageStepResults } from './verify-all.unit-test-steps.mjs';

function createBoundaryStepResult(boundaryResult, durationMs) {
  if (boundaryResult.exitCode !== 0) {
    return createFailureStep('Dependency boundaries', 'failed', {
      stderr: boundaryResult.output ? `${boundaryResult.output}\n` : '',
      durationMs,
    });
  }

  return {
    ...createOkStep('Dependency boundaries'),
    durationMs,
  };
}

function createCycleStepResult(cycles, durationMs) {
  if (cycles.length > 0) {
    return createFailureStep('Cycles', 'circular dependencies found', {
      stderr: [
        'Circular dependencies found:\n\n',
        ...cycles.map((cycle) => `- ${cycle.join(' -> ')}\n`),
      ].join(''),
      durationMs,
    });
  }

  return {
    ...createOkStep('Cycles'),
    durationMs,
  };
}

function createReusableGraphStepResults({
  reusableBoundaryState,
  reusableCycleState,
  startedAtMs,
}) {
  return [
    {
      ...createOkStep(
        'Dependency boundaries',
        `reused ${reusableBoundaryState.source} repo-wide graph state`
      ),
      durationMs: Date.now() - startedAtMs,
    },
    {
      ...createOkStep('Cycles', `reused ${reusableCycleState.source} repo-wide graph state`),
      durationMs: Date.now() - startedAtMs,
    },
  ];
}

export async function collectDependencyGraphStepResults({
  targetFiles,
  graphRunner = runDependencyGraphCheck,
  cacheSource = 'full-verify',
} = {}) {
  const startedAtMs = Date.now();
  const reusableBoundaryState = resolveReusableBoundaryCheck({ targetFiles });
  const reusableCycleState = resolveReusableCycleCheck({ targetFiles });

  if (reusableBoundaryState.matched && reusableCycleState.matched) {
    return createReusableGraphStepResults({
      reusableBoundaryState,
      reusableCycleState,
      startedAtMs,
    });
  }

  const { durationMs, value: graphResult } = await measureAsyncStep(() => graphRunner());
  const boundaryStep = createBoundaryStepResult(graphResult.boundary, durationMs);
  const cycleStep = createCycleStepResult(graphResult.cycles, durationMs);

  if (boundaryStep.status === 'ok') {
    recordSuccessfulBoundaryCheck({ targetFiles, source: cacheSource });
  }
  if (cycleStep.status === 'ok') {
    recordSuccessfulCycleCheck({ targetFiles, source: cacheSource });
  }

  return [boundaryStep, cycleStep];
}

export async function collectBoundaryCheckStepResult({ targetFiles }) {
  const [boundaryStep] = await collectDependencyGraphStepResults({ targetFiles });
  return boundaryStep;
}

export async function collectCycleCheckStepResult({ targetFiles }) {
  const [, cycleStep] = await collectDependencyGraphStepResults({ targetFiles });
  return cycleStep;
}

export function collectTypecheckStepResult({ targetFiles }) {
  const startedAtMs = Date.now();
  const reusableTypecheckState = resolveReusableTypecheckState({
    checkedProjectIds: FULL_TYPECHECK_PROJECT_IDS,
    mode: 'full',
    targetFiles,
  });

  if (reusableTypecheckState.matched) {
    return {
      ...createOkStep('Typecheck', `reused ${reusableTypecheckState.source} workspace state`),
      durationMs: Date.now() - startedAtMs,
    };
  }

  const { durationMs, value: typecheckResult } = measureSyncStep(() =>
    runTypecheck({ mode: 'full', targetFiles })
  );
  if (typecheckResult.status !== 0) {
    return createFailureStep('Typecheck', 'failed', {
      stdout: typecheckResult.stdout,
      stderr: typecheckResult.stderr,
      durationMs,
    });
  }

  recordSuccessfulTypecheck({
    checkedProjectIds: typecheckResult.checkedProjectIds,
    mode: typecheckResult.typecheckMode,
    targetFiles,
    source: 'full-verify',
  });
  return {
    ...createOkStep('Typecheck'),
    durationMs,
  };
}
