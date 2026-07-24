import { FUNCTION_PROFILES, STRUCTURAL_RISK_LIMITS } from './config.mjs';

function exceeds(value, limit) {
  return limit != null && value > limit;
}

function isNarrowAdapter(metric) {
  const hasProvenSingleStateReceiver =
    metric.stateAuthorities === 0 ||
    (metric.stateReceiverCount === 1 && metric.unresolvedStateAuthorityCount === 0);
  return (
    metric.architecturalLayer === 'adapter' &&
    hasProvenSingleStateReceiver &&
    metric.effectCount <= 1 &&
    metric.ownerGroupCount <= 1 &&
    metric.cohesion >= STRUCTURAL_RISK_LIMITS.cohesion.high &&
    metric.functions.every((fn) => fn.cyclomatic <= 4 && fn.nesting <= 2)
  );
}

function isTestProfile(metric) {
  return metric.profile === 'test' || metric.profile === 'test-fixture';
}

function scoreFileScale(metric) {
  let score = 0;
  if (metric.lines > 400) score += 1;
  if (metric.lines > 600) score += 1;
  return score;
}

function scoreFileSurface(metric) {
  let score = 0;
  if (metric.ownerGroupCount > 4) score += 2;
  if (metric.ownerGroupCount > 6) score += 2;
  if (metric.externalEdges > 12) score += 1;
  if (metric.externalEdges > 20) score += 1;
  if (metric.exports > 12) score += 1;
  if (metric.exports > 20) score += 1;
  return score;
}

function scoreFileRuntime(metric) {
  if (isTestProfile(metric)) return 0;
  return (
    (metric.effectCount > 3 ? 3 : 0) +
    (!isNarrowAdapter(metric) && metric.stateAuthorities > 2 ? 3 : 0) +
    (metric.effectfulClusters > 3 ? 2 : 0)
  );
}

function scoreLowCohesion(metric) {
  if (
    !isTestProfile(metric) &&
    metric.classifiedCallCount >= 5 &&
    metric.cohesion < STRUCTURAL_RISK_LIMITS.cohesion.low
  )
    return 3;
  return 0;
}

export function scoreFile(metric) {
  return (
    scoreFileScale(metric) +
    scoreFileSurface(metric) +
    scoreFileRuntime(metric) +
    scoreLowCohesion(metric)
  );
}

export function scoreFunction(metric) {
  if (metric.profile === 'generated-data') return 0;
  const limits = FUNCTION_PROFILES[metric.profile] ?? FUNCTION_PROFILES.default;
  let score = 0;
  if (metric.lines > limits.lines[0]) score += 1;
  if (exceeds(metric.statements, limits.statements)) score += 1;
  if (exceeds(metric.cyclomatic, limits.cyclomatic)) score += 2;
  if (exceeds(metric.cognitive, limits.cognitive)) score += 2;
  if (exceeds(metric.nesting, limits.nesting)) score += 2;
  if (exceeds(metric.recoveryPressure, limits.recovery)) score += 2;
  if (exceeds(metric.params, limits.params)) score += 1;
  if (exceeds(metric.effectCount, limits.effects)) score += 3;
  if (exceeds(metric.stateAuthorities, limits.state)) score += 3;
  if (exceeds(metric.ownerGroupCount, limits.owners)) score += 2;
  if (
    !isTestProfile(metric) &&
    metric.classifiedCallCount >= 5 &&
    metric.cohesion < STRUCTURAL_RISK_LIMITS.cohesion.low
  )
    score += 3;
  return score;
}

export function isOrchestrationReviewExempt(metric) {
  return (
    metric.profile === 'orchestration' &&
    !metric.effectFamilies.includes('dom-ui') &&
    metric.cyclomatic <= 10 &&
    metric.nesting <= 4 &&
    metric.cohesion >= STRUCTURAL_RISK_LIMITS.cohesion.high &&
    metric.ownerGroupCount <= 4
  );
}

export function getFunctionHardLineLimit(metric) {
  return (FUNCTION_PROFILES[metric.profile] ?? FUNCTION_PROFILES.default).lines[1];
}

export function getFunctionWarningLineLimit(metric) {
  return (FUNCTION_PROFILES[metric.profile] ?? FUNCTION_PROFILES.default).lines[0];
}
