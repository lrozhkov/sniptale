import {
  formatQaResourceProfile,
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../../../runtime/scheduling/resource-profile.mjs';
import { parseLaneResult } from '../../../runtime/workers/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../../../runtime/workers/lane-worker-runner.mjs';
import {
  appendTaskScheduleDetail,
  appendTaskScheduleDetailToFirst,
  appendTaskResultScheduleDetail,
  formatTaskScheduleDetail,
  indexTaskResults,
  runBoundedTasks,
} from '../../../runtime/scheduling/task-scheduler.mjs';
import { replaceDeferredOwnerGuardSteps } from '../../shared/owner-guard-step-helpers.mjs';
import { createSchedulerLaneTask } from '../../runtime/scheduler-lane-task.mjs';
import {
  TYPECHECK_CHECKERS,
  TYPESCRIPT_TOOL_VERSION,
} from '../../../analysis/source/typescript-cli.mjs';
import { OXLINT_TOOL_VERSION } from '../../../guards/quality/verify-oxlint.mjs';
import { orderQaResultSteps } from '../../catalog/catalog.mjs';
import { projectQaSchedulerLanes } from '../../catalog/scheduler-profiles.mjs';

const FULL_VERIFY_WORKER_URL = new URL('./worker.mjs', import.meta.url);
const FULL_RESULT_SHAPES = Object.freeze({
  appOwners: { ownerStep: 'step' },
  targetPaths: { ownerStep: 'step' },
  typecheck: { typecheckStep: 'step' },
  tests: { testSteps: 'steps' },
  lint: {
    loggingStep: 'step',
    oxlintStep: 'step',
    securityStep: 'step',
  },
  graph: { dependencySteps: 'steps', deadExportsStep: 'step' },
  light: {
    formatStep: 'nullable-step',
    lineLengthStep: 'nullable-step',
    repositoryReadabilityStep: 'nullable-step',
    deadCommentedCodeStep: 'step',
    structuralRiskStep: 'nullable-step',
    namingStep: 'step',
    mockParityStep: 'nullable-step',
    violationSteps: 'steps',
    i18nStep: 'step',
    designSystemStep: 'step',
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
    structuralCodeFiles: context.structuralCodeFiles,
    structuralComparisonRevision: context.structuralComparisonRevision,
    structuralDeletedFiles: context.structuralDeletedFiles,
    targetFiles: context.targetFiles,
  };
}

function createTasks({ context, includeTests, profile, workerRunner }) {
  const workerContext = createFullVerifyWorkerContext(context);
  const typecheckCheckerCount = Math.min(TYPECHECK_CHECKERS.full, profile.cpuTokens);
  const oxlintThreadCount = Math.min(8, Math.max(1, profile.cpuTokens - 2));
  return projectQaSchedulerLanes({
    includeTests,
    mode: 'full',
    releaseMode: context.releaseMode,
  }).map(({ dependencies, lane, resources: catalogResources, triggerProfiles }) => {
    const resources =
      lane === 'typecheck'
        ? { ...catalogResources, cpuTokens: typecheckCheckerCount }
        : lane === 'lint'
          ? { ...catalogResources, cpuTokens: oxlintThreadCount }
          : catalogResources;
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
      triggerProfiles,
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
  const scheduleOwner = value.lineLengthStep ?? value.deadCommentedCodeStep;
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
          deadCommentedCodeStep: appendTaskScheduleDetail(
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
  return orderQaResultSteps([
    ...(light.formatStep ? [light.formatStep] : []),
    ...(light.lineLengthStep ? [light.lineLengthStep] : []),
    ...(light.repositoryReadabilityStep ? [light.repositoryReadabilityStep] : []),
    lint.oxlintStep,
    lint.loggingStep,
    light.deadCommentedCodeStep,
    ...(light.structuralRiskStep ? [light.structuralRiskStep] : []),
    light.namingStep,
    ...(light.mockParityStep ? [light.mockParityStep] : []),
    ...replaceDeferredOwnerGuardSteps(light.violationSteps, ownerSteps),
    light.i18nStep,
    light.designSystemStep,
    lint.securityStep,
    ...graph.dependencySteps,
    typecheck.typecheckStep,
    graph.deadExportsStep,
    ...(includeTests ? tests.testSteps : []),
  ]);
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
