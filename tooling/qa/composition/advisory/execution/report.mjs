function formatFindingSection(title, findings, maximumPerFamily = 3) {
  if (findings.length === 0) {
    return [];
  }
  const lines = [`${title}:`];
  const findingsByFamily = new Map();
  for (const finding of findings) {
    const familyFindings = findingsByFamily.get(finding.family) ?? [];
    familyFindings.push(finding);
    findingsByFamily.set(finding.family, familyFindings);
  }

  for (const [family, familyFindings] of findingsByFamily.entries()) {
    for (const finding of familyFindings.slice(0, maximumPerFamily)) {
      const lineLabel = finding.line != null ? `:${finding.line}` : '';
      lines.push(
        `- ${finding.file}${lineLabel} [${finding.id}] ${finding.reason} Hint: ${finding.hint}`
      );
    }

    if (familyFindings.length > maximumPerFamily) {
      lines.push(`- [${family}] +${familyFindings.length - maximumPerFamily} more finding(s)`);
    }
  }
  return lines;
}

export function formatAdvisoryReport({ buckets }) {
  const introduced = buckets?.introduced ?? [];
  const worsened = buckets?.worsened ?? [];
  const existing = buckets?.existing ?? [];
  return `${[
    `Advisory: introduced=${introduced.length}, worsened=${worsened.length}, existing=${existing.length}`,
    ...formatFindingSection('Introduced', introduced),
    ...formatFindingSection('Worsened', worsened),
    ...(existing.length > 0
      ? [`Existing context: ${existing.length} unchanged — see run log`]
      : []),
  ].join('\n')}\n`;
}

export function formatAdvisoryLog({ buckets }) {
  const introduced = buckets?.introduced ?? [];
  const worsened = buckets?.worsened ?? [];
  const existing = buckets?.existing ?? [];
  return `${[
    `Advisory log: introduced=${introduced.length}, worsened=${worsened.length}, existing=${existing.length}`,
    ...formatFindingSection('Introduced', introduced, Number.POSITIVE_INFINITY),
    ...formatFindingSection('Worsened', worsened, Number.POSITIVE_INFINITY),
    ...formatFindingSection('Existing', existing, Number.POSITIVE_INFINITY),
  ].join('\n')}\n`;
}

export function printAdvisoryReport(report) {
  process.stdout.write(formatAdvisoryReport(report));
}
