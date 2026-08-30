import {
  formatQaResourceProfile,
  resolveQaResourceProfile,
} from '../../../runtime/scheduling/resource-profile.mjs';
import { parseLaneResult } from '../../../runtime/workers/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../../../runtime/workers/lane-worker-runner.mjs';
import {
  appendTaskScheduleDetail,
  formatTaskScheduleDetail,
  runBoundedTasks,
} from '../../../runtime/scheduling/task-scheduler.mjs';
import {
  TYPECHECK_CHECKERS,
  TYPESCRIPT_TOOL_VERSION,
} from '../../../analysis/source/typescript-cli.mjs';
import { OXLINT_TOOL_VERSION } from '../../../guards/quality/verify-oxlint.mjs';

const HARNESS_WORKER_URL = new URL('./worker.mjs', import.meta.url);
const LANE_RESOURCES = Object.freeze({
  static: { cpuTokens: 2, memoryMiB: 2048 },
  typecheck: { cpuTokens: TYPECHECK_CHECKERS.full, memoryMiB: 5120 },
  oxlint: { cpuTokens: 2, memoryMiB: 5120 },
  tests: { memoryMiB: 4096 },
});

const HARNESS_RESULT_SHAPES = Object.freeze({
  static: { steps: 'steps' },
  typecheck: { typecheckStep: 'step' },
  oxlint: { oxlintStep: 'step' },
  tests: { unitTestStep: 'step' },
});

export function runHarnessLaneWorker({
  context,
  lane,
  memoryMiB,
  signal,
  typecheckCheckerCount,
  vitestMaxWorkers,
}) {
  return runQaLaneWorker({
    label: `Harness QA worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: HARNESS_RESULT_SHAPES }),
    signal,
    workerData: { context, lane, typecheckCheckerCount, vitestMaxWorkers },
    workerUrl: HARNESS_WORKER_URL,
  });
}

function createHarnessWorkerContext(context) {
  return {
    baseline: context.baseline,
    codeFiles: context.codeFiles ?? [],
    existingTargetFiles: context.existingTargetFiles ?? [],
    harnessTargetFiles: context.harnessTargetFiles ?? [],
    jsLikeFiles: context.jsLikeFiles ?? [],
    qualityCodeFiles: context.qualityCodeFiles ?? [],
    qualityJsLikeFiles: context.qualityJsLikeFiles ?? [],
  };
}

export function createHarnessLaneTasks({ context, profile, workerRunner = runHarnessLaneWorker }) {
  const workerContext = createHarnessWorkerContext(context);
  const typecheckCheckerCount = Math.min(TYPECHECK_CHECKERS.full, profile.cpuTokens);
  return ['static', 'typecheck', 'oxlint', 'tests'].map((lane) => {
    const resources =
      lane === 'typecheck'
        ? { ...LANE_RESOURCES.typecheck, cpuTokens: typecheckCheckerCount }
        : LANE_RESOURCES[lane];
    const cpuTokens =
      lane === 'tests'
        ? profile.vitestMaxWorkers
        : lane === 'typecheck'
          ? typecheckCheckerCount
          : Math.min(resources.cpuTokens, profile.cpuTokens);
    return {
      id: lane,
      cpuTokens,
      dependencies: lane === 'oxlint' ? ['typecheck'] : [],
      executionProfile:
        lane === 'typecheck'
          ? {
              checkerCount: typecheckCheckerCount,
              toolName: 'typescript',
              toolVersion: TYPESCRIPT_TOOL_VERSION,
            }
          : lane === 'oxlint'
            ? { toolName: 'oxlint', toolVersion: OXLINT_TOOL_VERSION }
            : {},
      memoryMiB: resources.memoryMiB,
      workers:
        lane === 'tests'
          ? profile.vitestMaxWorkers
          : lane === 'typecheck'
            ? typecheckCheckerCount
            : 1,
      run: ({ signal }) =>
        workerRunner({
          context: workerContext,
          lane,
          memoryMiB: resources.memoryMiB,
          signal,
          typecheckCheckerCount,
          vitestMaxWorkers: profile.vitestMaxWorkers,
        }),
    };
  });
}

function annotate(result, profile) {
  const detail = formatTaskScheduleDetail(result, profile);
  if (result.id === 'static') {
    const [first, ...remaining] = result.value.steps;
    return {
      ...result.value,
      steps: [
        appendTaskScheduleDetail(first, `${detail}; ${formatQaResourceProfile(profile)}`),
        ...remaining,
      ],
    };
  }
  if (result.id === 'typecheck') {
    return {
      ...result.value,
      typecheckStep: appendTaskScheduleDetail(result.value.typecheckStep, detail),
    };
  }
  if (result.id === 'oxlint') {
    return {
      ...result.value,
      oxlintStep: appendTaskScheduleDetail(result.value.oxlintStep, detail),
    };
  }
  return {
    ...result.value,
    unitTestStep: appendTaskScheduleDetail(result.value.unitTestStep, detail),
  };
}

function assemble(results) {
  const lanes = new Map(results.map((result) => [result.id, result.value]));
  return [
    ...lanes.get('static').steps,
    lanes.get('typecheck').typecheckStep,
    lanes.get('oxlint').oxlintStep,
    lanes.get('tests').unitTestStep,
  ];
}

export async function collectScheduledHarnessStepResults(
  context,
  {
    profile = resolveQaResourceProfile(),
    scheduler = runBoundedTasks,
    workerRunner = runHarnessLaneWorker,
  } = {}
) {
  const results = await scheduler(createHarnessLaneTasks({ context, profile, workerRunner }), {
    profile,
  });
  return assemble(results.map((result) => ({ ...result, value: annotate(result, profile) })));
}
