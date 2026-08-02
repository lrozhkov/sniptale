import { formatQaResourceProfile, resolveQaResourceProfile } from '../runtime/resource-profile.mjs';
import { parseLaneResult } from '../runtime/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../runtime/lane-worker-runner.mjs';
import {
  appendTaskScheduleDetail,
  appendTaskScheduleDetailToFirst,
  formatTaskScheduleDetail,
  indexTaskResults,
  runBoundedTasks,
} from '../runtime/task-scheduler.mjs';
import { replaceDeferredOwnerGuardSteps } from './owner-guard-step-helpers.mjs';

const FOCUSED_WORKER_URL = new URL('./verify-focused.worker.mjs', import.meta.url);
const LANE_RESOURCES = Object.freeze({
  appOwners: { cpuTokens: 1, memoryMiB: 1024 },
  targetPaths: { cpuTokens: 1, memoryMiB: 1024 },
  typecheck: { cpuTokens: 2, memoryMiB: 3072 },
  tests: { memoryMiB: 4096 },
  lint: { cpuTokens: 1, memoryMiB: 3072 },
  graph: { cpuTokens: 1, memoryMiB: 1536 },
  light: { cpuTokens: 1, memoryMiB: 1024 },
});

const FOCUSED_RESULT_SHAPES = Object.freeze({
  appOwners: { ownerStep: 'step' },
  targetPaths: { ownerStep: 'step' },
  typecheck: { typecheckStep: 'step' },
  tests: { testSteps: 'steps' },
  lint: { eslintStep: 'step', sonarjsStep: 'step', securityStep: 'step' },
  graph: { dependencySteps: 'steps', deadExportsStep: 'step' },
  light: {
    oxlintStep: 'step',
    qualitySteps: 'steps',
    triggeredStaticSteps: 'steps',
    policySteps: 'steps',
  },
});

export function runFocusedLaneWorker({
  context,
  lane,
  memoryMiB,
  signal,
  typecheckMaxConcurrency,
  vitestMaxWorkers,
}) {
  return runQaLaneWorker({
    label: `Focused QA worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: FOCUSED_RESULT_SHAPES }),
    signal,
    workerData: { context, lane, typecheckMaxConcurrency, vitestMaxWorkers },
    workerUrl: FOCUSED_WORKER_URL,
  });
}

function createFocusedWorkerContext(context) {
  return {
    addedFiles: context.addedFiles,
    baseline: context.baseline,
    codeFiles: context.codeFiles,
    existingTargetFiles: context.existingTargetFiles,
    jsLikeFiles: context.jsLikeFiles,
    qualityCodeFiles: context.qualityCodeFiles,
    qualityJsLikeFiles: context.qualityJsLikeFiles,
    qualityTargetFiles: context.qualityTargetFiles,
    shouldRunManifestPermissions: context.shouldRunManifestPermissions,
    shouldRunFullEslint: context.shouldRunFullEslint,
    shouldRunRuntimeTopology: context.shouldRunRuntimeTopology,
    targetFiles: context.targetFiles,
  };
}

function createFocusedLaneTasks({ context, profile, workerRunner }) {
  const workerContext = createFocusedWorkerContext(context);
  const typecheckMaxConcurrency = Math.min(2, profile.cpuTokens);
  return ['targetPaths', 'appOwners', 'typecheck', 'tests', 'lint', 'graph', 'light'].map(
    (lane) => {
      const fullEslintClosure = lane === 'lint' && context.shouldRunFullEslint;
      const resources = fullEslintClosure
        ? { cpuTokens: Math.min(2, profile.cpuTokens), memoryMiB: 6144 }
        : LANE_RESOURCES[lane];
      const cpuTokens =
        lane === 'tests'
          ? profile.vitestMaxWorkers
          : lane === 'typecheck'
            ? typecheckMaxConcurrency
            : resources.cpuTokens;
      const memoryMiB = resources.memoryMiB;
      return {
        id: lane,
        cpuTokens,
        memoryMiB,
        run: ({ signal }) =>
          workerRunner({
            context: workerContext,
            lane,
            memoryMiB,
            signal,
            typecheckMaxConcurrency,
            vitestMaxWorkers: profile.vitestMaxWorkers,
          }),
      };
    }
  );
}

function annotateLaneResult(scheduled, profile) {
  const detail = formatTaskScheduleDetail(scheduled, profile);
  const value = scheduled.value;
  if (scheduled.id === 'appOwners' || scheduled.id === 'targetPaths') {
    return { ...value, ownerStep: appendTaskScheduleDetail(value.ownerStep, detail) };
  }
  if (scheduled.id === 'typecheck') {
    return { ...value, typecheckStep: appendTaskScheduleDetail(value.typecheckStep, detail) };
  }
  if (scheduled.id === 'tests') {
    const [unitTestStep, ...remaining] = value.testSteps;
    return { ...value, testSteps: [appendTaskScheduleDetail(unitTestStep, detail), ...remaining] };
  }
  if (scheduled.id === 'lint') {
    return { ...value, eslintStep: appendTaskScheduleDetail(value.eslintStep, detail) };
  }
  if (scheduled.id === 'graph') {
    return {
      ...value,
      dependencySteps: appendTaskScheduleDetailToFirst(value.dependencySteps, detail),
    };
  }
  return {
    ...value,
    oxlintStep: appendTaskScheduleDetail(
      value.oxlintStep,
      `${detail}; ${formatQaResourceProfile(profile)}`
    ),
  };
}

function assembleFocusedSteps(results) {
  const { appOwners, graph, light, lint, targetPaths, tests, typecheck } =
    indexTaskResults(results);
  const ownerSteps = [appOwners.ownerStep, targetPaths.ownerStep];

  return [
    light.oxlintStep,
    lint.eslintStep,
    lint.sonarjsStep,
    ...light.qualitySteps,
    ...replaceDeferredOwnerGuardSteps(light.triggeredStaticSteps, ownerSteps),
    ...graph.dependencySteps,
    typecheck.typecheckStep,
    ...light.policySteps,
    lint.securityStep,
    graph.deadExportsStep,
    ...tests.testSteps,
  ];
}

export async function collectScheduledFocusedStepResults(
  context,
  {
    profile = resolveQaResourceProfile(),
    scheduler = runBoundedTasks,
    workerRunner = runFocusedLaneWorker,
  } = {}
) {
  const scheduled = await scheduler(createFocusedLaneTasks({ context, profile, workerRunner }), {
    profile,
  });
  const annotated = scheduled.map((result) => ({
    ...result,
    value: annotateLaneResult(result, profile),
  }));
  return assembleFocusedSteps(annotated);
}
