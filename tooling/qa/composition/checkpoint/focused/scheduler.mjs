import {
  formatQaResourceProfile,
  resolveQaResourceProfile,
} from '../../../runtime/scheduling/resource-profile.mjs';
import { parseLaneResult } from '../../../runtime/workers/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../../../runtime/workers/lane-worker-runner.mjs';
import {
  appendTaskScheduleDetail,
  appendTaskScheduleDetailToFirst,
  formatTaskScheduleDetail,
  indexTaskResults,
  runBoundedTasks,
} from '../../../runtime/scheduling/task-scheduler.mjs';
import { replaceDeferredOwnerGuardSteps } from '../../shared/owner-guard-step-helpers.mjs';
import { createSchedulerLaneTask } from '../../runtime/scheduler-lane-task.mjs';
import { COMMON_SCHEDULER_RESULT_SHAPES } from '../../runtime/scheduler-result-shapes.mjs';
import {
  TYPECHECK_CHECKERS,
  TYPESCRIPT_TOOL_VERSION,
} from '../../../analysis/source/typescript-cli.mjs';
import { OXLINT_TOOL_VERSION } from '../../../guards/quality/verify-oxlint.mjs';
import { orderQaResultSteps } from '../../catalog/catalog.mjs';
import { projectQaSchedulerLanes } from '../../catalog/scheduler-profiles.mjs';

const FOCUSED_WORKER_URL = new URL('./worker.mjs', import.meta.url);
const FOCUSED_RESULT_SHAPES = Object.freeze({
  ...COMMON_SCHEDULER_RESULT_SHAPES,
  light: {
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
  typecheckCheckerCount,
  typecheckMaxConcurrency,
  vitestMaxWorkers,
}) {
  return runQaLaneWorker({
    label: `Focused QA worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: FOCUSED_RESULT_SHAPES }),
    signal,
    workerData: {
      context,
      lane,
      typecheckCheckerCount,
      typecheckMaxConcurrency,
      vitestMaxWorkers,
    },
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
    shouldRunFullOxlint: context.shouldRunFullOxlint,
    shouldRunRuntimeTopology: context.shouldRunRuntimeTopology,
    targetFiles: context.targetFiles,
  };
}

function createFocusedLaneTasks({ context, profile, workerRunner }) {
  const workerContext = createFocusedWorkerContext(context);
  const typecheckCheckerCount = Math.min(TYPECHECK_CHECKERS.affected, profile.cpuTokens);
  const typecheckMaxConcurrency = 1;
  return projectQaSchedulerLanes({ mode: 'focused' }).map(
    ({ lane, resources: catalogResources, triggerProfiles }) => {
      const fullOxlintClosure = lane === 'lint' && context.shouldRunFullOxlint;
      const resources = fullOxlintClosure
        ? { cpuTokens: Math.min(2, profile.cpuTokens), memoryMiB: 6144 }
        : lane === 'typecheck'
          ? { ...catalogResources, cpuTokens: typecheckCheckerCount }
          : catalogResources;
      const cpuTokens =
        lane === 'tests'
          ? profile.vitestMaxWorkers
          : lane === 'typecheck'
            ? typecheckCheckerCount
            : resources.cpuTokens;
      const memoryMiB = resources.memoryMiB;
      return createSchedulerLaneTask({
        cpuTokens,
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
        workerArguments: { typecheckMaxConcurrency },
        workerContext,
        workerRunner,
      });
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
    return { ...value, oxlintStep: appendTaskScheduleDetail(value.oxlintStep, detail) };
  }
  if (scheduled.id === 'graph') {
    return {
      ...value,
      dependencySteps: appendTaskScheduleDetailToFirst(value.dependencySteps, detail),
    };
  }
  const [first, ...remaining] = value.qualitySteps;
  return {
    ...value,
    qualitySteps: [
      appendTaskScheduleDetail(first, `${detail}; ${formatQaResourceProfile(profile)}`),
      ...remaining,
    ],
  };
}

function assembleFocusedSteps(results) {
  const { appOwners, graph, light, lint, targetPaths, tests, typecheck } =
    indexTaskResults(results);
  const ownerSteps = [appOwners.ownerStep, targetPaths.ownerStep];

  return orderQaResultSteps([
    lint.oxlintStep,
    lint.loggingStep,
    ...light.qualitySteps,
    ...replaceDeferredOwnerGuardSteps(light.triggeredStaticSteps, ownerSteps),
    ...graph.dependencySteps,
    typecheck.typecheckStep,
    ...light.policySteps,
    lint.securityStep,
    graph.deadExportsStep,
    ...tests.testSteps,
  ]);
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
