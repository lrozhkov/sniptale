import { runReturnedObjectSurfaceAdvisoryCheck } from './verify-interface-surfaces.return-bags.mjs';
import { collectFlowPressureFindings } from './verify-advisory.flow-detectors.helpers.mjs';
import { collectReadTransportFindings } from './verify-advisory.read-transport.helpers.mjs';
import { collectStatefulFlowFindings } from './verify-advisory.stateful-flow.helpers.mjs';
import { collectStaticStructureFindings } from './verify-advisory.static-detectors.helpers.mjs';

export function createFinding({ family, file, line = null, reason, hint, severity = 'watch' }) {
  return { family, file, line, reason, hint, severity };
}

export function compareFindings(left, right) {
  const severityRank = { attention: 0, watch: 1 };
  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    left.family.localeCompare(right.family) ||
    left.file.localeCompare(right.file) ||
    (left.line ?? 0) - (right.line ?? 0)
  );
}

export function elevateCompositeOwnerPressure(findings) {
  const familyCountsByFile = new Map();
  for (const finding of findings) {
    const families = familyCountsByFile.get(finding.file) ?? new Set();
    families.add(finding.family);
    familyCountsByFile.set(finding.file, families);
  }

  return findings.map((finding) =>
    (familyCountsByFile.get(finding.file)?.size ?? 0) >= 2
      ? { ...finding, severity: 'attention' }
      : finding
  );
}

export function collectReturnedBagFindings(codeFiles) {
  if (codeFiles.length === 0) {
    return [];
  }

  const advisoryResult = runReturnedObjectSurfaceAdvisoryCheck({ files: codeFiles });
  if (advisoryResult.skipped) {
    return [];
  }

  return advisoryResult.advisories.map((advisory) =>
    createFinding({
      family: 'Broad returned object surfaces',
      file: advisory.file,
      line: advisory.line ?? null,
      reason: advisory.message,
      hint: 'Split the returned controller/state bag before the next feature lands here.',
      severity: 'attention',
    })
  );
}

export function collectFileHeuristicFindings(file) {
  return [
    ...collectStaticStructureFindings(file, createFinding),
    ...collectFlowPressureFindings(file, createFinding),
    ...collectReadTransportFindings(file, createFinding),
    ...collectStatefulFlowFindings(file, createFinding),
  ];
}
