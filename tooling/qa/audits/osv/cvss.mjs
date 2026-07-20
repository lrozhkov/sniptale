const SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function severityFromBaseScore(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MODERATE';
  return score > 0 ? 'LOW' : null;
}

function parseVector(score, prefix) {
  const source = score.startsWith(prefix) ? score.slice(prefix.length) : score;
  const metrics = new Map();
  for (const segment of source.split('/')) {
    const separator = segment.indexOf(':');
    if (separator <= 0 || separator === segment.length - 1) return null;
    const name = segment.slice(0, separator);
    if (metrics.has(name)) return null;
    metrics.set(name, segment.slice(separator + 1));
  }
  return metrics;
}

function metric(metrics, name, values) {
  return values[metrics.get(name)] ?? null;
}

function roundUp(value) {
  return Math.ceil((value - Number.EPSILON) * 10) / 10;
}

function cvssV3BaseScore(score) {
  const prefix = /^CVSS:3\.[01]\//u.exec(score)?.[0];
  if (!prefix) return null;
  const metrics = parseVector(score, prefix);
  if (!metrics) return null;
  const scope = metrics.get('S');
  const av = metric(metrics, 'AV', { N: 0.85, A: 0.62, L: 0.55, P: 0.2 });
  const ac = metric(metrics, 'AC', { L: 0.77, H: 0.44 });
  const ui = metric(metrics, 'UI', { N: 0.85, R: 0.62 });
  const pr = metric(
    metrics,
    'PR',
    scope === 'C' ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 }
  );
  const confidentiality = metric(metrics, 'C', { N: 0, L: 0.22, H: 0.56 });
  const integrity = metric(metrics, 'I', { N: 0, L: 0.22, H: 0.56 });
  const availability = metric(metrics, 'A', { N: 0, L: 0.22, H: 0.56 });
  if (
    !['U', 'C'].includes(scope) ||
    [av, ac, ui, pr, confidentiality, integrity, availability].some((value) => value === null)
  ) {
    return null;
  }
  const iss = 1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);
  const impact =
    scope === 'U' ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * pr * ui;
  const combined = impact + exploitability;
  return roundUp(Math.min(scope === 'U' ? combined : 1.08 * combined, 10));
}

function cvssV2BaseScore(score) {
  if (score.startsWith('CVSS:') && !score.startsWith('CVSS:2.0/')) return null;
  const prefix = score.startsWith('CVSS:2.0/') ? 'CVSS:2.0/' : '';
  const metrics = parseVector(score, prefix);
  if (!metrics) return null;
  const av = metric(metrics, 'AV', { L: 0.395, A: 0.646, N: 1 });
  const ac = metric(metrics, 'AC', { H: 0.35, M: 0.61, L: 0.71 });
  const authentication = metric(metrics, 'Au', { M: 0.45, S: 0.56, N: 0.704 });
  const confidentiality = metric(metrics, 'C', { N: 0, P: 0.275, C: 0.66 });
  const integrity = metric(metrics, 'I', { N: 0, P: 0.275, C: 0.66 });
  const availability = metric(metrics, 'A', { N: 0, P: 0.275, C: 0.66 });
  if (
    [av, ac, authentication, confidentiality, integrity, availability].some(
      (value) => value === null
    )
  ) {
    return null;
  }
  const impact = 10.41 * (1 - (1 - confidentiality) * (1 - integrity) * (1 - availability));
  if (impact <= 0) return 0;
  const exploitability = 20 * av * ac * authentication;
  return (
    Math.round(((0.6 * impact + 0.4 * exploitability - 1.5) * 1.176 + Number.EPSILON) * 10) / 10
  );
}

const CVSS_V4_METRICS = Object.freeze({
  AV: ['N', 'A', 'L', 'P'],
  AC: ['L', 'H'],
  AT: ['N', 'P'],
  PR: ['N', 'L', 'H'],
  UI: ['N', 'P', 'A'],
  VC: ['H', 'L', 'N'],
  VI: ['H', 'L', 'N'],
  VA: ['H', 'L', 'N'],
  SC: ['H', 'L', 'N'],
  SI: ['H', 'L', 'N', 'S'],
  SA: ['H', 'L', 'N', 'S'],
  E: ['X', 'A', 'P', 'U'],
});
const CVSS_V4_REQUIRED_METRICS = Object.freeze([
  'AV',
  'AC',
  'AT',
  'PR',
  'UI',
  'VC',
  'VI',
  'VA',
  'SC',
  'SI',
  'SA',
]);

function isValidCvssV4Vector(score) {
  if (!score.startsWith('CVSS:4.0/')) return false;
  const metrics = parseVector(score, 'CVSS:4.0/');
  if (!metrics) return false;
  if (CVSS_V4_REQUIRED_METRICS.some((name) => !metrics.has(name))) return false;
  return [...metrics].every(([name, value]) => CVSS_V4_METRICS[name]?.includes(value) === true);
}

function highestSeverity(severities) {
  return severities.reduce(
    (highest, severity) =>
      SEVERITIES.indexOf(severity) > SEVERITIES.indexOf(highest) ? severity : highest,
    null
  );
}

export function classifyCvssEvidence(entry, groupSeverities) {
  if (entry.type === 'CVSS_V2') {
    return severityFromBaseScore(cvssV2BaseScore(entry.score));
  }
  if (entry.type === 'CVSS_V3') {
    return severityFromBaseScore(cvssV3BaseScore(entry.score));
  }
  if (entry.type === 'CVSS_V4') {
    return isValidCvssV4Vector(entry.score) ? highestSeverity(groupSeverities) : null;
  }
  return null;
}
