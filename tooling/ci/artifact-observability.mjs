import {
  createObservabilityRun,
  resumeLatestObservabilityRun,
} from '../qa/runtime/observability/index.mjs';

function failedPhaseDiagnostic(phase) {
  return {
    summary: `CI prerequisite phase ${phase.id} failed before the canonical wrapper started`,
    locations: [],
    remediation: 'Inspect the phase ledger and correct the failing CI prerequisite.',
    ruleDoc: 'docs/tooling/ci-cd.md',
    evidence: [],
  };
}

export function resolveCiArtifactSession({
  lane,
  phases,
  startedAtMs,
  repositoryRoot = process.cwd(),
  storageRoot = repositoryRoot,
  environment = process.env,
} = {}) {
  const wrapperId = `ci:${lane}`;
  const resumed = resumeLatestObservabilityRun({
    allowMissing: true,
    environment,
    notBeforeMs: startedAtMs,
    rootDir: storageRoot,
    wrapperId,
  });
  if (resumed) return resumed;

  const canonicalLaneIndex = phases.findIndex(({ id }) => id === lane);
  const failedPhase =
    canonicalLaneIndex < 0
      ? null
      : phases.slice(0, canonicalLaneIndex).find(({ status }) => status === 'failed');
  if (!failedPhase) {
    throw new Error(`Expected a resumable ${wrapperId} run after successful CI prerequisites.`);
  }

  const session = createObservabilityRun({
    environment,
    repositoryRoot,
    storageRoot,
    wrapperId,
  });
  session.attachRepositoryContext({ mode: 'ci-prerequisite-failure' });
  session.addStep({
    stepId: 'qa.rule.wrapper-lifecycle',
    outcome: 'error',
    problemIds: ['ci.prerequisite-phase.failed'],
    diagnostic: failedPhaseDiagnostic(failedPhase),
    log: `CI prerequisite phase ${failedPhase.id} exited with code ${failedPhase.exitCode ?? 1}.`,
  });
  return session;
}
