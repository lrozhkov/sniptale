import {
  formatQaResourceProfile,
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../runtime/resource-profile.mjs';
import { parseLaneResult } from '../runtime/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../runtime/lane-worker-runner.mjs';
import {
  appendTaskScheduleDetail,
  appendTaskScheduleDetailToFirst,
  appendTaskResultScheduleDetail,
  formatTaskScheduleDetail,
  indexTaskResults,
  runBoundedTasks,
} from '../runtime/task-scheduler.mjs';
import { replaceDeferredOwnerGuardSteps } from './owner-guard-step-helpers.mjs';

const FULL_VERIFY_WORKER_URL = new URL('./verify-all.worker.mjs', import.meta.url);
const LANE_RESOURCES = Object.freeze({
  appOwners: { cpuTokens: 1, memoryMiB: 1024 },
  targetPaths: { cpuTokens: 1, memoryMiB: 1024 },
  typecheck: { cpuTokens: 1, memoryMiB: 3072 },
  graph: { cpuTokens: 1, memoryMiB: 2048 },
  lint: { cpuTokens: 2, memoryMiB: 6144 },
  tests: { memoryMiB: 4096 },
  light: { cpuTokens: 1, memoryMiB: 1024 },
});

const FULL_RESULT_SHAPES = Object.freeze({
  appOwners: { ownerStep: 'step' },
  targetPaths: { ownerStep: 'step' },
  typecheck: { typecheckStep: 'step' },
  tests: { testSteps: 'steps' },
  lint: { eslintStep: 'step', sonarjsStep: 'nullable-step', securityStep: 'step' },
  graph: { dependencySteps: 'steps', deadExportsStep: 'step' },
  light: {
    lineLengthStep: 'step',
    oxlintStep: 'step',
    aiHygieneStep: 'step',
    structuralRiskStep: 'step',
    namingStep: 'step',
    violationSteps: 'steps',
    i18nStep: 'step',
    designSystemStep: 'step',
    auditStep: 'step',
  },
});

export function runFullVerifyLaneWorker({ context, lane, memoryMiB, signal, vitestMaxWorkers }) {
  return runQaLaneWorker({
    label: `Full verification worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: FULL_RESULT_SHAPES }),
    signal,
    workerData: { context, lane, vitestMaxWorkers },
    workerUrl: FULL_VERIFY_WORKER_URL,
  });
}

function createFullVerifyWorkerContext(context) {
  return {
    baseline: context.baseline,
    codeFiles: context.codeFiles,
    releaseMode: context.releaseMode,
    targetFiles: context.targetFiles,
  };
}

function createTasks({ context, profile, workerRunner }) {
  const workerContext = createFullVerifyWorkerContext(context);
  return ['targetPaths', 'appOwners', 'typecheck', 'tests', 'lint', 'graph', 'light'].map(
    (lane) => {
      const resources = LANE_RESOURCES[lane];
      const dedicatedReleaseTests = context.releaseMode && lane === 'tests';
      const cpuTokens =
        lane === 'tests'
          ? dedicatedReleaseTests
            ? profile.cpuTokens
            : profile.vitestMaxWorkers
          : resources.cpuTokens;
      const memoryMiB = dedicatedReleaseTests ? profile.memoryMiB : resources.memoryMiB;
      return {
        id: lane,
        cpuTokens,
        exclusive: dedicatedReleaseTests,
        memoryMiB,
        run: ({ signal }) =>
          workerRunner({
            context: workerContext,
            lane,
            memoryMiB,
            signal,
            vitestMaxWorkers: profile.vitestMaxWorkers,
          }),
      };
    }
  );
}

function annotate(result, profile) {
  const detail = formatTaskScheduleDetail(result, profile);
  const value = result.value;
  if (result.id === 'appOwners' || result.id === 'targetPaths') {
    return { ...value, ownerStep: appendTaskScheduleDetail(value.ownerStep, detail) };
  }
  if (result.id === 'typecheck') {
    return appendTaskResultScheduleDetail(value, 'typecheckStep', detail);
  }
  if (result.id === 'tests') {
    return appendTaskResultScheduleDetail(value, 'testSteps', detail, { list: true });
  }
  if (result.id === 'lint') {
    return { ...value, eslintStep: appendTaskScheduleDetail(value.eslintStep, detail) };
  }
  if (result.id === 'graph') {
    return {
      ...value,
      dependencySteps: appendTaskScheduleDetailToFirst(value.dependencySteps, detail),
    };
  }
  return {
    ...value,
    lineLengthStep: appendTaskScheduleDetail(
      value.lineLengthStep,
      `${detail}; ${formatQaResourceProfile(profile)}`
    ),
  };
}

function assemble(results, releaseMode) {
  const { appOwners, graph, light, lint, targetPaths, tests, typecheck } =
    indexTaskResults(results);
  const ownerSteps = [appOwners.ownerStep, targetPaths.ownerStep];
  return [
    light.lineLengthStep,
    light.oxlintStep,
    lint.eslintStep,
    ...(releaseMode ? [lint.sonarjsStep] : []),
    light.aiHygieneStep,
    light.structuralRiskStep,
    light.namingStep,
    ...replaceDeferredOwnerGuardSteps(light.violationSteps, ownerSteps),
    light.i18nStep,
    light.designSystemStep,
    light.auditStep,
    lint.securityStep,
    ...graph.dependencySteps,
    typecheck.typecheckStep,
    graph.deadExportsStep,
    ...tests.testSteps,
  ];
}

export async function collectScheduledFullVerifySteps(
  context,
  { profile = null, scheduler = runBoundedTasks, workerRunner = runFullVerifyLaneWorker } = {}
) {
  const selectedProfile =
    profile ??
    (context.releaseMode ? resolveQaReleaseResourceProfile() : resolveQaResourceProfile());
  const tasks = createTasks({ context, profile: selectedProfile, workerRunner });
  const results = context.releaseMode
    ? [
        ...(await scheduler(
          tasks.filter(({ id }) => id !== 'tests'),
          { profile: selectedProfile }
        )),
        ...(await scheduler(
          tasks.filter(({ id }) => id === 'tests'),
          { profile: selectedProfile }
        )),
      ]
    : await scheduler(tasks, { profile: selectedProfile });
  return assemble(
    results.map((result) => ({ ...result, value: annotate(result, selectedProfile) })),
    context.releaseMode
  );
}
