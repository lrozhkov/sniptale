import crypto from 'node:crypto';
import fs from 'node:fs';

function stableFinding(finding) {
  return Object.fromEntries(
    Object.entries(finding)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function createRepositoryFindingDigest(findings) {
  const normalized = findings
    .map(stableFinding)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
}

export function applyRepositoryFindingBaseline({ baselinePath, controlId, findings }) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (
    baseline?.schemaVersion !== 1 ||
    baseline.controlId !== controlId ||
    !Number.isInteger(baseline.findingCount) ||
    !/^sha256:[a-f0-9]{64}$/u.test(baseline.findingDigest ?? '')
  ) {
    throw new Error(`Malformed repository finding baseline: ${baselinePath}`);
  }
  const findingDigest = createRepositoryFindingDigest(findings);
  const matched =
    baseline.findingCount === findings.length && baseline.findingDigest === findingDigest;
  return {
    baseline,
    findingDigest,
    matched,
    violations: matched
      ? []
      : [
          ...findings,
          {
            rule: 'repository-baseline-drift',
            file: baselinePath,
            line: 1,
            message:
              `Exact ${controlId} baseline drifted: ` +
              `expected ${baseline.findingCount}/${baseline.findingDigest}, ` +
              `observed ${findings.length}/${findingDigest}.`,
          },
        ],
  };
}
