import crypto from 'node:crypto';
import fs from 'node:fs';

function stableFinding(finding) {
  return Object.fromEntries(
    Object.entries(finding)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function findingIdentity(finding) {
  return JSON.stringify(stableFinding(finding));
}

function sortFindings(findings) {
  return findings
    .map(stableFinding)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function createRepositoryFindingDigest(findings) {
  const normalized = sortFindings(findings);
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
}

function findingWithoutNoiseId(finding) {
  const { noiseId: _noiseId, ...rawFinding } = finding;
  return rawFinding;
}

export function createRepositoryFindingBaseline({ acceptance, controlId, findings }) {
  const normalized = sortFindings(findings);
  return {
    schemaVersion: 2,
    controlId,
    findingCount: normalized.length,
    findingDigest: createRepositoryFindingDigest(normalized),
    rationales: [acceptance],
    findings: normalized.map((finding) => ({ ...finding, noiseId: acceptance.id })),
  };
}

function isFinding(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
  );
}

function isNoiseRationale(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify(['classification', 'id', 'owner', 'reason', 'removalCondition']) &&
    value.classification === 'tool-noise' &&
    [value.id, value.owner, value.reason, value.removalCondition].every(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    )
  );
}

function validateBaseline(baseline, baselinePath, controlId) {
  const rawFindings = Array.isArray(baseline?.findings)
    ? baseline.findings.map(findingWithoutNoiseId)
    : [];
  const normalizedFindings = sortFindings(rawFindings);
  const rationaleIds = new Set(baseline?.rationales?.map(({ id }) => id) ?? []);
  if (
    baseline?.schemaVersion !== 2 ||
    baseline.controlId !== controlId ||
    !Number.isInteger(baseline.findingCount) ||
    !/^sha256:[a-f0-9]{64}$/u.test(baseline.findingDigest ?? '') ||
    !Array.isArray(baseline.rationales) ||
    baseline.rationales.length === 0 ||
    baseline.rationales.some((rationale) => !isNoiseRationale(rationale)) ||
    rationaleIds.size !== baseline.rationales.length ||
    !Array.isArray(baseline.findings) ||
    baseline.findings.some((finding) => !isFinding(finding)) ||
    baseline.findings.some(
      (finding) => typeof finding.noiseId !== 'string' || !rationaleIds.has(finding.noiseId)
    ) ||
    baseline.findingCount !== baseline.findings.length ||
    baseline.findingDigest !== createRepositoryFindingDigest(rawFindings) ||
    JSON.stringify(rawFindings) !== JSON.stringify(normalizedFindings)
  ) {
    throw new Error(`Malformed repository finding baseline: ${baselinePath}`);
  }
}

function indexFindingOccurrences(findings, findingKey) {
  const occurrences = new Map();
  for (const finding of findings) {
    const identity = findingKey(finding);
    const values = occurrences.get(identity) ?? [];
    values.push(finding);
    occurrences.set(identity, values);
  }
  return occurrences;
}

function takeAcceptedOccurrence({ acceptedOccurrences, finding, findingKey, isAcceptedFinding }) {
  const values = acceptedOccurrences.get(findingKey(finding));
  if (!values || values.length === 0) return false;
  const acceptedIndex = values.findIndex((accepted) => isAcceptedFinding(finding, accepted));
  if (acceptedIndex === -1) {
    values.pop();
    return false;
  }
  values.splice(acceptedIndex, 1);
  return true;
}

function staleFindingAdvisory({ baselinePath, controlId, finding }) {
  return {
    rule: 'repository-baseline-stale',
    file: typeof finding.file === 'string' ? finding.file : baselinePath,
    ...(Number.isInteger(finding.line) ? { line: finding.line } : {}),
    message:
      `Reviewed ${controlId} tool-noise finding is absent from the repository; ` +
      'baseline cleanup is non-blocking.',
  };
}

export function applyRepositoryFindingBaseline({
  baselinePath,
  controlId,
  findingKey = findingIdentity,
  findings,
  isAcceptedFinding = (current, accepted) => findingIdentity(current) === findingIdentity(accepted),
}) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  validateBaseline(baseline, baselinePath, controlId);
  const acceptedFindings = baseline.findings.map(findingWithoutNoiseId);
  const findingDigest = createRepositoryFindingDigest(findings);
  const matched =
    baseline.findingCount === findings.length && baseline.findingDigest === findingDigest;
  const acceptedOccurrences = indexFindingOccurrences(acceptedFindings, findingKey);
  const violations = findings.filter(
    (finding) =>
      !takeAcceptedOccurrence({ acceptedOccurrences, finding, findingKey, isAcceptedFinding })
  );
  const advisories = [...acceptedOccurrences.values()]
    .flat()
    .map((finding) => staleFindingAdvisory({ baselinePath, controlId, finding }));
  return {
    baseline,
    findingDigest,
    matched,
    violations,
    advisories,
  };
}
