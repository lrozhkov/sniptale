import { formatQaResourceProfile, resolveQaResourceProfile } from '../runtime/resource-profile.mjs';
import { parseLaneResult } from '../runtime/lane-worker-contract.mjs';
import { runQaLaneWorker } from '../runtime/lane-worker-runner.mjs';
import {
  appendTaskScheduleDetail,
  formatTaskScheduleDetail,
  runBoundedTasks,
} from '../runtime/task-scheduler.mjs';

const HARNESS_WORKER_URL = new URL('./verify-harness.worker.mjs', import.meta.url);
const LANE_RESOURCES = Object.freeze({
  static: { cpuTokens: 2, memoryMiB: 2048 },
  typecheck: { cpuTokens: 1, memoryMiB: 3072 },
  tests: { memoryMiB: 4096 },
});

const HARNESS_RESULT_SHAPES = Object.freeze({
  static: { steps: 'steps' },
  typecheck: { typecheckStep: 'step' },
  tests: { unitTestStep: 'step' },
});

export function runHarnessLaneWorker({ context, lane, memoryMiB, signal, vitestMaxWorkers }) {
  return runQaLaneWorker({
    label: `Harness QA worker ${lane}`,
    memoryMiB,
    resultParser: (value) => parseLaneResult(value, { lane, shapes: HARNESS_RESULT_SHAPES }),
    signal,
    workerData: { context, lane, vitestMaxWorkers },
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
  return ['static', 'typecheck', 'tests'].map((lane) => {
    const resources = LANE_RESOURCES[lane];
    const cpuTokens =
      lane === 'tests'
        ? profile.vitestMaxWorkers
        : Math.min(resources.cpuTokens, profile.cpuTokens);
    return {
      id: lane,
      cpuTokens,
      memoryMiB: resources.memoryMiB,
      run: ({ signal }) =>
        workerRunner({
          context: workerContext,
          lane,
          memoryMiB: resources.memoryMiB,
          signal,
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
