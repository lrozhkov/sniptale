import { evaluateSpdxExpression } from '../../policy/spdx-expression.mjs';

export function normalizeLicense(value) {
  return String(value ?? '').trim() || 'NOASSERTION';
}

export function collectComponentLicense(component) {
  const expressions = (component.licenses ?? [])
    .map(
      (entry) =>
        entry.expression ?? entry.license?.expression ?? entry.license?.id ?? entry.license?.name
    )
    .filter(Boolean);
  return normalizeLicense(expressions.length ? expressions.join(' OR ') : component.license);
}

export function toComponentName(component) {
  return component.name ?? component.purl ?? '<unknown>';
}

function matchesReviewedDecision(component, license, containment, decision) {
  return (
    containment !== null &&
    decision.packageName === toComponentName(component) &&
    decision.resolvedVersion === component.version &&
    decision.dependencyScope === containment.dependencyScope &&
    decision.artifactInclusion === containment.artifactInclusion &&
    decision.licenseExpression === license &&
    typeof decision.reason === 'string' &&
    decision.reason &&
    typeof decision.debtId === 'string' &&
    decision.debtId &&
    typeof decision.approvalOwner === 'string' &&
    decision.approvalOwner &&
    typeof decision.expiresOn === 'string' &&
    decision.expiresOn >= new Date().toISOString().slice(0, 10)
  );
}

export function findReviewedLicenseDecision(component, license, containment, policy) {
  return (policy.reviewedExceptions ?? []).find((decision) =>
    matchesReviewedDecision(component, license, containment, decision)
  );
}

export function collectStaleReviewedLicenseDecisions(components, containmentByComponent, policy) {
  const deniedLicenses = new Set((policy.deniedLicenses ?? []).map(normalizeLicense));
  return (policy.reviewedExceptions ?? [])
    .filter(
      (decision) =>
        !components.some((component) => {
          const license = collectComponentLicense(component);
          const evaluation = evaluateSpdxExpression(license, deniedLicenses);
          return (
            !evaluation?.allowed &&
            matchesReviewedDecision(
              component,
              license,
              containmentByComponent.get(component) ?? null,
              decision
            )
          );
        })
    )
    .map((decision) => ({
      packageName: decision.packageName,
      version: decision.resolvedVersion,
      license: decision.licenseExpression,
    }));
}
