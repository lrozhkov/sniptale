import { FUNCTION_PROFILES, STRUCTURAL_RISK_LIMITS } from './config.mjs';

function exceeds(value, limit) {
  return limit != null && value > limit;
}

export function scoreFile(metric) {
  let score = 0;
  if (metric.lines > 400) score += 1;
  if (metric.lines > 600) score += 1;
  if (metric.ownerGroupCount > 4) score += 2;
  if (metric.ownerGroupCount > 6) score += 2;
  if (metric.externalEdges > 12) score += 1;
  if (metric.externalEdges > 20) score += 1;
  if (metric.exports > 12) score += 1;
  if (metric.exports > 20) score += 1;
  if (metric.effectCount > 3) score += 3;
  if (metric.stateAuthorities > 2) score += 3;
  if (metric.effectfulClusters > 3) score += 2;
  if (
    metric.profile !== 'test' &&
    metric.classifiedCallCount >= 5 &&
    metric.cohesion < STRUCTURAL_RISK_LIMITS.cohesion.low
  )
    score += 3;
  return score;
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
    metric.profile !== 'test' &&
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
