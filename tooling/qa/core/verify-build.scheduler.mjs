import {
  formatQaResourceProfile,
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../runtime/resource-profile.mjs';
import { parseLaneResult } from '../runtime/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../runtime/lane-worker-runner.mjs';
import { formatTaskScheduleDetail, runBoundedTasks } from '../runtime/task-scheduler.mjs';

const BUILD_WORKER_URL = new URL('./verify-build.worker.mjs', import.meta.url);
const BUILD_LANE_RESOURCES = Object.freeze({
  typecheck: { cpuTokens: 1, memoryMiB: 3072 },
  tests: { memoryMiB: 4096 },
  security: { cpuTokens: 1, memoryMiB: 3072 },
  graph: { cpuTokens: 1, memoryMiB: 1536 },
  static: { cpuTokens: 1, memoryMiB: 1024 },
});

const BUILD_RESULT_SHAPES = Object.freeze({
  typecheck: { typecheckStep: 'step' },
  tests: { testSteps: 'steps' },
  security: { securityStep: 'step' },
  graph: { dependencySteps: 'steps' },
  static: {
    namingStep: 'step',
    architectureStep: 'step',
    canonicalFacadeStep: 'step',
    rootSideEffectsStep: 'step',
  },
});

export function runBuildLaneWorker({
  buildScope,
  context,
  lane,
  memoryMiB,
  signal,
  vitestMaxWorkers,
}) {
  return runQaLaneWorker({
    label: `Build QA worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: BUILD_RESULT_SHAPES }),
    signal,
    workerData: { buildScope, context, lane, vitestMaxWorkers },
    workerUrl: BUILD_WORKER_URL,
  });
}

function createBuildWorkerContext(context) {
  return { codeFiles: context.codeFiles, targetFiles: context.targetFiles };
}

function createBuildWorkerScope(buildScope) {
  return {
    staticScope: buildScope.staticScope,
    testScope: {
      detail: buildScope.testScope.detail,
      directTestFiles: buildScope.testScope.directTestFiles,
      fullSuite: buildScope.testScope.fullSuite,
      relatedFiles: buildScope.testScope.relatedFiles,
      requireRelatedTests: buildScope.testScope.requireRelatedTests,
    },
  };
}

function createTasks({ buildScope, context, profile, workerRunner }) {
  const workerBuildScope = createBuildWorkerScope(buildScope);
  const workerContext = createBuildWorkerContext(context);
  return ['typecheck', 'tests', 'security', 'graph', 'static'].map((lane) => {
    const resources = BUILD_LANE_RESOURCES[lane];
    const dedicatedFullSuiteTests = buildScope.testScope.fullSuite && lane === 'tests';
    const cpuTokens =
      lane === 'tests'
        ? dedicatedFullSuiteTests
          ? profile.cpuTokens
          : profile.vitestMaxWorkers
        : resources.cpuTokens;
    const memoryMiB = dedicatedFullSuiteTests ? profile.memoryMiB : resources.memoryMiB;
    return {
      id: lane,
      cpuTokens,
      exclusive: dedicatedFullSuiteTests,
      memoryMiB,
      run: ({ signal }) =>
        workerRunner({
          buildScope: workerBuildScope,
          context: workerContext,
          lane,
          memoryMiB,
          signal,
          vitestMaxWorkers: profile.vitestMaxWorkers,
        }),
    };
  });
}

function appendDetail(step, detail) {
  return { ...step, detail: [step.detail, detail].filter(Boolean).join('; ') };
}

function annotate(result, profile) {
  const detail = formatTaskScheduleDetail(result, profile);
  const value = result.value;
  if (result.id === 'typecheck') {
    return { ...value, typecheckStep: appendDetail(value.typecheckStep, detail) };
  }
  if (result.id === 'tests') {
    const [unitTestStep, ...remaining] = value.testSteps;
    return { ...value, testSteps: [appendDetail(unitTestStep, detail), ...remaining] };
  }
  if (result.id === 'security') {
    return { ...value, securityStep: appendDetail(value.securityStep, detail) };
  }
  if (result.id === 'graph') {
    const [first, ...remaining] = value.dependencySteps;
    return { ...value, dependencySteps: [appendDetail(first, detail), ...remaining] };
  }
  return {
    ...value,
    namingStep: appendDetail(value.namingStep, `${detail}; ${formatQaResourceProfile(profile)}`),
  };
}

function assemble(results) {
  const lanes = new Map(results.map((result) => [result.id, result.value]));
  const staticLane = lanes.get('static');
  const security = lanes.get('security');
  const graph = lanes.get('graph');
  const typecheck = lanes.get('typecheck');
  const tests = lanes.get('tests');
  return [
    staticLane.namingStep,
    security.securityStep,
    staticLane.architectureStep,
    ...graph.dependencySteps,
    staticLane.canonicalFacadeStep,
    staticLane.rootSideEffectsStep,
    typecheck.typecheckStep,
    ...tests.testSteps,
  ];
}

export async function collectScheduledBuildStepResults(
  { buildScope, context },
  {
    fullSuiteProfileResolver = resolveQaReleaseResourceProfile,
    profile = resolveQaResourceProfile(),
    scheduler = runBoundedTasks,
    workerRunner = runBuildLaneWorker,
  } = {}
) {
  const tasks = createTasks({ buildScope, context, profile, workerRunner });
  if (!buildScope.testScope.fullSuite) {
    const results = await scheduler(tasks, { profile });
    return assemble(results.map((result) => ({ ...result, value: annotate(result, profile) })));
  }

  const prerequisiteResults = await scheduler(
    tasks.filter(({ id }) => id !== 'tests'),
    { profile }
  );
  const selectedFullSuiteProfile = fullSuiteProfileResolver();
  const fullSuiteTasks = createTasks({
    buildScope,
    context,
    profile: selectedFullSuiteProfile,
    workerRunner,
  });
  const fullSuiteResults = await scheduler(
    fullSuiteTasks.filter(({ id }) => id === 'tests'),
    { profile: selectedFullSuiteProfile }
  );
  return assemble([
    ...prerequisiteResults.map((result) => ({
      ...result,
      value: annotate(result, profile),
    })),
    ...fullSuiteResults.map((result) => ({
      ...result,
      value: annotate(result, selectedFullSuiteProfile),
    })),
  ]);
}
