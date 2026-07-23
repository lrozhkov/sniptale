import { FUNCTION_PROFILES, STRUCTURAL_RISK_LIMITS } from './config.mjs';

export function buildFileRemediationHint(metric) {
  const hints = [];
  if (metric.classifiedCallCount >= 5 && metric.cohesion < STRUCTURAL_RISK_LIMITS.cohesion.low) {
    hints.push('Split independent change reasons behind explicit owner contracts.');
  }
  if (metric.ownerGroupCount > 4 || metric.externalEdges > 12 || metric.exports > 12) {
    hints.push('Narrow cross-owner edges or the exported surface.');
  }
  if (metric.stateAuthorities > 2) {
    hints.push(
      'Prove which state signals share one receiver; otherwise consolidate mutation behind one state owner.'
    );
  }
  if (metric.effectCount > 3 || metric.effectfulClusters > 3) {
    hints.push(
      'Move unrelated effect families behind narrow adapters or a cohesive workflow owner.'
    );
  }
  if (metric.lines > STRUCTURAL_RISK_LIMITS.file.longLines) {
    hints.push('Extract only independently changing behavior, not line-count fragments.');
  }
  if (hints.length === 0) {
    hints.push('Review the worsened structural dimension against the owner/change-reason cluster.');
  }
  hints.push('Keep cohesive transaction and orchestration boundaries intact.');
  return hints.join(' ');
}

export function buildFunctionRemediationHint(metric) {
  const limits = FUNCTION_PROFILES[metric.profile] ?? FUNCTION_PROFILES.default;
  const hints = [];
  if (
    metric.ownerGroupCount > limits.owners ||
    metric.cohesion < STRUCTURAL_RISK_LIMITS.cohesion.low
  ) {
    hints.push('Extract an independently changing owner operation.');
  }
  if (limits.state != null && metric.stateAuthorities > limits.state) {
    hints.push('Prove shared state receivers or route mutation through one narrow state owner.');
  }
  if (limits.effects != null && metric.effectCount > limits.effects) {
    hints.push('Move unrelated effects behind narrow adapters.');
  }
  if (
    metric.cyclomatic > limits.cyclomatic ||
    metric.cognitive > limits.cognitive ||
    metric.nesting > limits.nesting ||
    (limits.recovery != null && metric.recoveryPressure > limits.recovery)
  ) {
    hints.push(
      'Name cohesive decision or recovery steps without breaking the transaction boundary.'
    );
  }
  if (metric.lines > limits.lines[0] || metric.statements > limits.statements) {
    hints.push('Extract only behavior with an independent reason to change.');
  }
  if (hints.length === 0) hints.push('Review the worsened metric against the function contract.');
  return hints.join(' ');
}
