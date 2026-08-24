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
import { createSchedulerLaneTask } from './scheduler-lane-task.mjs';
import { TYPECHECK_CHECKERS, TYPESCRIPT_TOOL_VERSION } from './typescript-cli.mjs';
import { OXLINT_TOOL_VERSION } from './verify-oxlint.mjs';

const FULL_VERIFY_WORKER_URL = new URL('./verify-all.worker.mjs', import.meta.url);
const LANE_RESOURCES = Object.freeze({
  appOwners: { cpuTokens: 1, memoryMiB: 1024 },
  targetPaths: { cpuTokens: 1, memoryMiB: 1024 },
  typecheck: { cpuTokens: TYPECHECK_CHECKERS.full, memoryMiB: 5120 },
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
  lint: { oxlintStep: 'step', sonarjsStep: 'nullable-step', securityStep: 'step' },
  graph: { dependencySteps: 'steps', deadExportsStep: 'step' },
  light: {
    lineLengthStep: 'nullable-step',
    aiHygieneStep: 'step',
    structuralRiskStep: 'nullable-step',
    namingStep: 'step',
    violationSteps: 'steps',
    i18nStep: 'step',
    designSystemStep: 'step',
    auditStep: 'step',
  },
});

export function runFullVerifyLaneWorker({
  context,
  lane,
  memoryMiB,
  oxlintThreadCount,
  signal,
  typecheckCheckerCount,
  vitestMaxWorkers,
}) {
  return runQaLaneWorker({
    label: `Full verification worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: FULL_RESULT_SHAPES }),
    signal,
    workerData: {
      context,
      lane,
      oxlintThreadCount,
      typecheckCheckerCount,
      vitestMaxWorkers,
    },
    workerUrl: FULL_VERIFY_WORKER_URL,
  });
}

function createFullVerifyWorkerContext(context) {
  return {
    baseline: context.baseline,
    codeFiles: context.codeFiles,
    excludedControlLabels: context.excludedControlLabels,
    releaseMode: context.releaseMode,
    targetFiles: context.targetFiles,
  };
}

function createTasks({ context, includeTests, profile, workerRunner }) {
  const workerContext = createFullVerifyWorkerContext(context);
  const typecheckCheckerCount = Math.min(TYPECHECK_CHECKERS.full, profile.cpuTokens);
  const oxlintThreadCount = Math.min(8, Math.max(1, profile.cpuTokens - 2));
  const lanes = ['targetPaths', 'appOwners', 'typecheck', 'lint', 'graph', 'light'];
  if (includeTests) lanes.splice(3, 0, 'tests');
  return lanes.map((lane) => {
    const resources =
      lane === 'typecheck'
        ? { ...LANE_RESOURCES.typecheck, cpuTokens: typecheckCheckerCount }
        : lane === 'lint'
          ? { ...LANE_RESOURCES.lint, cpuTokens: oxlintThreadCount }
          : LANE_RESOURCES[lane];
    const dependencies =
      lane === 'typecheck'
        ? ['lint']
        : ['graph', 'light'].includes(lane) || (lane === 'tests' && !context.releaseMode)
          ? ['lint', 'typecheck']
          : [];
    const dedicatedReleaseTests = context.releaseMode && lane === 'tests';
    const cpuTokens =
      lane === 'tests'
        ? dedicatedReleaseTests
          ? profile.cpuTokens
          : profile.vitestMaxWorkers
        : resources.cpuTokens;
    const memoryMiB = dedicatedReleaseTests ? profile.memoryMiB : resources.memoryMiB;
    return createSchedulerLaneTask({
      cpuTokens,
      dependencies,
      exclusive: dedicatedReleaseTests,
      executionProfile:
        lane === 'typecheck'
          ? {
              checkerCount: typecheckCheckerCount,
              toolName: 'typescript',
              toolVersion: TYPESCRIPT_TOOL_VERSION,
            }
          : lane === 'lint'
            ? { toolName: 'oxlint', toolVersion: OXLINT_TOOL_VERSION }
            : {},
      memoryMiB,
      lane,
      profile,
      typecheckCheckerCount,
      workers: lane === 'lint' ? oxlintThreadCount : null,
      workerContext,
      workerRunner,
      workerArguments: { oxlintThreadCount },
    });
  });
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
    return { ...value, oxlintStep: appendTaskScheduleDetail(value.oxlintStep, detail) };
  }
  if (result.id === 'graph') {
    return {
      ...value,
      dependencySteps: appendTaskScheduleDetailToFirst(value.dependencySteps, detail),
    };
  }
  const scheduleOwner = value.lineLengthStep ?? value.aiHygieneStep;
  return {
    ...value,
    ...(value.lineLengthStep
      ? {
          lineLengthStep: appendTaskScheduleDetail(
            value.lineLengthStep,
            `${detail}; ${formatQaResourceProfile(profile)}`
          ),
        }
      : {
          aiHygieneStep: appendTaskScheduleDetail(
            scheduleOwner,
            `${detail}; ${formatQaResourceProfile(profile)}`
          ),
        }),
  };
}

function assemble(results, releaseMode, includeTests) {
  const { appOwners, graph, light, lint, targetPaths, tests, typecheck } =
    indexTaskResults(results);
  const ownerSteps = [appOwners.ownerStep, targetPaths.ownerStep];
  return [
    ...(light.lineLengthStep ? [light.lineLengthStep] : []),
    lint.oxlintStep,
    ...(releaseMode && lint.sonarjsStep ? [lint.sonarjsStep] : []),
    light.aiHygieneStep,
    ...(light.structuralRiskStep ? [light.structuralRiskStep] : []),
    light.namingStep,
    ...replaceDeferredOwnerGuardSteps(light.violationSteps, ownerSteps),
    light.i18nStep,
    light.designSystemStep,
    light.auditStep,
    lint.securityStep,
    ...graph.dependencySteps,
    typecheck.typecheckStep,
    graph.deadExportsStep,
    ...(includeTests ? tests.testSteps : []),
  ];
}

export async function collectScheduledFullVerifySteps(
  context,
  {
    includeTests = true,
    profile = null,
    scheduler = runBoundedTasks,
    workerRunner = runFullVerifyLaneWorker,
  } = {}
) {
  const selectedProfile =
    profile ??
    (context.releaseMode ? resolveQaReleaseResourceProfile() : resolveQaResourceProfile());
  const tasks = createTasks({ context, includeTests, profile: selectedProfile, workerRunner });
  const results =
    context.releaseMode && includeTests
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
    context.releaseMode,
    includeTests
  );
}
