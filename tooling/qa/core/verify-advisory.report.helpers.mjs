const ADVISORY_CHECK_DESCRIPTIONS = [
  'structural file pressure',
  'structural function pressure',
  'UI proof gaps',
  'detached this-sensitive method references',
];

function formatFindingSection(title, findings) {
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
    for (const finding of familyFindings.slice(0, 3)) {
      const lineLabel = finding.line != null ? `:${finding.line}` : '';
      lines.push(
        `- ${finding.file}${lineLabel} [${finding.id}] ${finding.reason} Hint: ${finding.hint}`
      );
    }

    if (familyFindings.length > 3) {
      lines.push(`- [${family}] +${familyFindings.length - 3} more finding(s)`);
    }
  }
  return lines;
}

export function formatAdvisoryReport({ findings }) {
  const attention = findings.filter((finding) => finding.severity === 'attention');
  const watch = findings.filter((finding) => finding.severity !== 'attention');
  return `${[
    `Non-blocking advisory checks: ${ADVISORY_CHECK_DESCRIPTIONS.join(', ')}`,
    ...formatFindingSection('Attention (non-blocking)', attention),
    ...formatFindingSection('Review signals', watch),
    `Advisory (non-blocking): attention=${attention.length}, watch=${watch.length}`,
  ].join('\n')}\n`;
}

export function printAdvisoryReport(report) {
  process.stdout.write(formatAdvisoryReport(report));
}
