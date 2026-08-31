import { evaluateSpdxExpression } from '../../policy/legal/spdx-expression.mjs';
import { collectDecisionContainment } from './containment.mjs';
import {
  collectComponentLicense,
  collectStaleReviewedLicenseDecisions,
  findReviewedLicenseDecision,
  normalizeLicense,
  toComponentName,
} from './reviewed-decisions.mjs';

function summarizeLicenses(components) {
  const counts = new Map();
  for (const component of components) {
    const license = collectComponentLicense(component);
    counts.set(license, (counts.get(license) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(
      ([leftLicense, leftCount], [rightLicense, rightCount]) =>
        rightCount - leftCount || leftLicense.localeCompare(rightLicense)
    )
  );
}

function collectDeniedCandidates(components, containmentByComponent, policy) {
  const deniedLicenses = new Set(policy.deniedLicenses.map(normalizeLicense));
  return components
    .map((component) => {
      const license = collectComponentLicense(component);
      if (evaluateSpdxExpression(license, deniedLicenses)?.allowed) return null;
      const containment = containmentByComponent.get(component) ?? null;
      const reviewedException = findReviewedLicenseDecision(
        component,
        license,
        containment,
        policy
      );
      return {
        packageName: toComponentName(component, containment),
        version: component.version ?? null,
        license,
        dependencyScope: containment?.dependencyScope ?? null,
        artifactInclusion: containment?.artifactInclusion ?? null,
        exceptionReason: reviewedException?.reason ?? null,
      };
    })
    .filter(Boolean);
}

function isFirstPartyComponent(component) {
  const markers = (component?.properties ?? []).filter(
    (property) => property?.name === 'cdx:npm:package:private'
  );
  return markers.length === 1 && markers[0].value === 'true';
}

function collectFirstPartyViolations(components, policy) {
  return components
    .filter(isFirstPartyComponent)
    .filter((component) => collectComponentLicense(component) !== policy.firstPartyLicense)
    .map((component) => ({
      packageName: toComponentName(component),
      version: component.version ?? null,
      license: collectComponentLicense(component),
    }));
}

function createSummary(lock, sbom, policy) {
  const components = sbom.components ?? [];
  const metadataComponent = sbom.metadata?.component;
  const firstPartyComponents = [metadataComponent, ...components].filter(isFirstPartyComponent);
  const dependencyComponents = components.filter((component) => !isFirstPartyComponent(component));
  const containmentByComponent = new Map(
    dependencyComponents.map((component) => [
      component,
      collectDecisionContainment(component, lock),
    ])
  );
  const staleReviewedExceptions = collectStaleReviewedLicenseDecisions(
    dependencyComponents,
    containmentByComponent,
    policy
  );
  const unknownComponents = dependencyComponents
    .filter((component) => collectComponentLicense(component) === 'NOASSERTION')
    .map((component) => ({
      packageName: toComponentName(component),
      version: component.version ?? null,
    }));
  return {
    staleReviewedExceptions,
    summary: {
      mode: policy.mode,
      componentCount: components.length,
      dependencyComponentCount: dependencyComponents.length,
      firstPartyComponents: firstPartyComponents.map((component) => ({
        packageName: toComponentName(component),
        version: component.version ?? null,
        license: collectComponentLicense(component),
      })),
      firstPartyViolations: collectFirstPartyViolations(firstPartyComponents, policy),
      licenseCounts: summarizeLicenses(dependencyComponents),
      deniedCandidates: collectDeniedCandidates(
        dependencyComponents,
        containmentByComponent,
        policy
      ),
      staleReviewedExceptionCount: staleReviewedExceptions.length,
      unknownComponents,
    },
  };
}

function toViolation(rule, file, message) {
  return { rule, file, message };
}

function collectBlockingViolations(summary, staleReviewedExceptions) {
  const stale = staleReviewedExceptions.map((exception) =>
    toViolation(
      'license-policy-stale-exception',
      'tooling/configs/qa/licenses.json',
      [
        `${exception.packageName}@${exception.version}: ${exception.license}.`,
        'Reviewed exception does not suppress an exact live SBOM component/license.',
      ].join(' ')
    )
  );
  if (summary.mode !== 'hardfail') return stale;
  return [
    ...stale,
    ...summary.deniedCandidates
      .filter((candidate) => !candidate.exceptionReason)
      .map((candidate) =>
        toViolation(
          'license-policy',
          'package-lock.json',
          `${candidate.packageName}@${candidate.version ?? '<unknown>'}: ${candidate.license}`
        )
      ),
    ...summary.unknownComponents.map((component) =>
      toViolation(
        'license-policy-unknown',
        'package-lock.json',
        `${component.packageName}@${component.version ?? '<unknown>'}: unknown license`
      )
    ),
    ...summary.firstPartyViolations.map((component) =>
      toViolation(
        'license-policy-first-party',
        'package-lock.json',
        `${component.packageName}@${component.version ?? '<unknown>'}: ${component.license}`
      )
    ),
  ];
}

export function evaluateLicenseInventory({ lock, sbom, policy }) {
  const evaluation = createSummary(lock, sbom, policy);
  return {
    summary: evaluation.summary,
    violations: collectBlockingViolations(evaluation.summary, evaluation.staleReviewedExceptions),
  };
}

export function formatLicenseSummary(summary) {
  return [
    `Mode: ${summary.mode}`,
    `Components: ${summary.componentCount}`,
    `First-party license mismatches: ${summary.firstPartyViolations.length}`,
    `Denied license candidates: ${summary.deniedCandidates.length}`,
    `Stale reviewed exceptions: ${summary.staleReviewedExceptionCount}`,
    `Unknown licenses: ${summary.unknownComponents.length}`,
  ].join('\n');
}
