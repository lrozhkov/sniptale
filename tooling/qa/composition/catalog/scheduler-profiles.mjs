import { QA_CONTROL_CATALOG } from './catalog.mjs';

const MODE_LANES = Object.freeze({
  focused: new Set(['focused-direct', 'focused-guardrail', 'focused-triggered']),
  full: new Set(['release-direct', 'release-guardrail']),
});

const CAPACITY_PROFILES = Object.freeze({
  focused: Object.freeze({
    appOwners: { cpuTokens: 1, memoryMiB: 1024 },
    targetPaths: { cpuTokens: 1, memoryMiB: 1024 },
    typecheck: { memoryMiB: 5120 },
    tests: { memoryMiB: 4096 },
    lint: { cpuTokens: 1, memoryMiB: 3072 },
    graph: { cpuTokens: 1, memoryMiB: 1536 },
    light: { cpuTokens: 1, memoryMiB: 1024 },
  }),
  full: Object.freeze({
    appOwners: { cpuTokens: 1, memoryMiB: 1024 },
    targetPaths: { cpuTokens: 1, memoryMiB: 1024 },
    typecheck: { memoryMiB: 5120 },
    tests: { memoryMiB: 4096 },
    lint: { cpuTokens: 2, memoryMiB: 6144 },
    graph: { cpuTokens: 1, memoryMiB: 2048 },
    light: { cpuTokens: 1, memoryMiB: 2048 },
  }),
});

export function validateQaSchedulerCatalog(controls) {
  for (const control of controls) {
    if (!control.schedulerLane || !control.schedulerDependencyProfile || !control.resourceProfile) {
      throw new Error(`QA scheduler metadata missing for ${control.id}`);
    }
  }
  return controls;
}

export function assertQaSchedulerCapacityClosure(lanes, capacityProfile, mode) {
  const capacityKeys = Object.keys(capacityProfile).sort();
  const projectedKeys = [...lanes].sort();
  if (JSON.stringify(capacityKeys) !== JSON.stringify(projectedKeys)) {
    throw new Error(`QA scheduler capacity profile drift for ${mode}`);
  }
}

function resolveDependencies({ dependencyProfiles, mode, releaseMode }) {
  if (mode !== 'full') return [];
  if (dependencyProfiles.has('after-lint')) return ['lint'];
  if (
    dependencyProfiles.has('after-lint-and-typecheck') ||
    (dependencyProfiles.has('after-lint-and-typecheck-unless-release') && !releaseMode)
  ) {
    return ['lint', 'typecheck'];
  }
  return [];
}

export function projectQaSchedulerLanes({ includeTests = true, mode, releaseMode = false }) {
  const admittedLanes = MODE_LANES[mode];
  if (!admittedLanes) throw new Error(`Unknown QA scheduler mode: ${mode}`);
  const controls = validateQaSchedulerCatalog(
    QA_CONTROL_CATALOG.filter((control) =>
      control.occurrences.some(({ lane }) => admittedLanes.has(lane))
    )
  );
  const controlsByLane = new Map();
  for (const control of controls) {
    const lane = control.schedulerLane;
    const values = controlsByLane.get(lane) ?? [];
    values.push(control);
    controlsByLane.set(lane, values);
  }
  const projectedLanes = [...controlsByLane]
    .filter(([lane]) => includeTests || lane !== 'tests')
    .map(([lane, laneControls]) => ({
      lane,
      controls: Object.freeze(laneControls),
      dependencies: Object.freeze(
        resolveDependencies({
          dependencyProfiles: new Set(
            laneControls.map(({ schedulerDependencyProfile }) => schedulerDependencyProfile)
          ),
          mode,
          releaseMode,
        })
      ),
      resourceClasses: Object.freeze([
        ...new Set(laneControls.map(({ resourceProfile }) => resourceProfile)),
      ]),
      resources: CAPACITY_PROFILES[mode][lane],
      triggerProfiles: Object.freeze([
        ...new Set(laneControls.map(({ triggerProfile }) => triggerProfile)),
      ]),
    }));
  assertQaSchedulerCapacityClosure(controlsByLane.keys(), CAPACITY_PROFILES[mode], mode);
  return projectedLanes;
}
