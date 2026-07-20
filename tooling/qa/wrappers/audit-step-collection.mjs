import { createFailureStep } from '../core/focused-qa-results.mjs';
import { measureAsyncStep, measureSyncStep } from '../core/step-timing.helpers.mjs';
import { normalizeAuditFailure } from '../audits/execution-error.mjs';
import { createProfileExcludedAuditStep } from './audit-tool-step.mjs';

export function toTimedStep(step, durationMs) {
  return { ...step, durationMs };
}

function controlPolicy(profile, controlId) {
  const policy = profile.controls.get(controlId);
  if (!policy) throw new Error(`Audit profile ${profile.id} has no control ${controlId}`);
  return policy;
}

export function createAuditCollectionFailureStep(label, error, durationMs) {
  const failure = normalizeAuditFailure(error);
  const stderr = [`[${failure.kind}] ${failure.message}`, failure.stderr]
    .filter(Boolean)
    .join('\n');
  return toTimedStep(
    createFailureStep(label, failure.kind, {
      ...(failure.exitCode === null ? {} : { exitCode: failure.exitCode }),
      stderr,
      stdout: failure.stdout,
    }),
    failure.durationMs ?? durationMs
  );
}

function reportProgress(onProgress, event) {
  onProgress?.(event);
}

function completeProgress(onProgress, controlId, label, step) {
  reportProgress(onProgress, {
    controlId,
    label,
    state: 'completed',
    outcome: step.status,
    durationMs: step.durationMs,
  });
  return step;
}

function collectMeasuredStep(profile, controlId, label, collector, toStep, onProgress, measure) {
  const policy = controlPolicy(profile, controlId);
  if (policy.requirement === 'excluded') {
    return completeProgress(
      onProgress,
      controlId,
      label,
      createProfileExcludedAuditStep(label, profile.id)
    );
  }
  reportProgress(onProgress, { controlId, label, state: 'started' });
  const startedAt = Date.now();
  const completeMeasurement = ({ durationMs, value }) =>
    completeProgress(onProgress, controlId, label, toStep(value, durationMs, policy));
  const failMeasurement = (error) =>
    completeProgress(
      onProgress,
      controlId,
      label,
      createAuditCollectionFailureStep(label, error, Date.now() - startedAt)
    );
  try {
    const measurement = measure(collector);
    return measurement instanceof Promise
      ? measurement.then(completeMeasurement).catch(failMeasurement)
      : completeMeasurement(measurement);
  } catch (error) {
    return failMeasurement(error);
  }
}

export function collectProfiledSyncStep(profile, controlId, label, collector, toStep, onProgress) {
  return collectMeasuredStep(
    profile,
    controlId,
    label,
    collector,
    toStep,
    onProgress,
    measureSyncStep
  );
}

export async function collectProfiledAsyncStep(profile, ...args) {
  return collectMeasuredStep(profile, ...args, measureAsyncStep);
}
