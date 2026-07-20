import { printFocusedGuardrailReport } from './guardrail-preflight-report.mjs';

const ADVISORY_CHECK_DESCRIPTIONS = [
  'preflight structural hints',
  'broad returned object surfaces',
  'singleton service roots',
  'hidden mutable module state',
  'props-builder proliferation',
  'hidden orchestration in helpers/controllers',
  'read-path compat / normalization drift',
  'transport/command catalog pressure',
  'misleading read-safe / bootstrap naming',
  'lifecycle intent loss in reconnect/retry seams',
  'destructive async swap risk',
  'detached editor-controller method references',
  'detached this-sensitive method references',
  'success/failure asymmetry',
  'composite owner pressure',
  'wide UI diffs without proof matrix',
  'UI visual proof plan',
  'capability loss risk in command/toolbars',
];

function printAdvisoryChecksSummary() {
  process.stdout.write(
    ['Advisory checks:', ADVISORY_CHECK_DESCRIPTIONS.join(', '), '\n'].join(' ')
  );
}

function printFindingSection(title, findings) {
  if (findings.length === 0) {
    return;
  }

  process.stdout.write(`${title}:\n`);
  const findingsByFamily = new Map();
  for (const finding of findings) {
    const familyFindings = findingsByFamily.get(finding.family) ?? [];
    familyFindings.push(finding);
    findingsByFamily.set(finding.family, familyFindings);
  }

  for (const [family, familyFindings] of findingsByFamily.entries()) {
    for (const finding of familyFindings.slice(0, 3)) {
      const lineLabel = finding.line != null ? `:${finding.line}` : '';
      process.stdout.write(
        `- ${finding.file}${lineLabel} [${family}] ${finding.reason} Hint: ${finding.hint}\n`
      );
    }

    if (familyFindings.length > 3) {
      process.stdout.write(`- [${family}] +${familyFindings.length - 3} more finding(s)\n`);
    }
  }
}

export function printAdvisoryReport({ preflightReport, findings }) {
  printAdvisoryChecksSummary();
  printFocusedGuardrailReport(preflightReport);

  const attention = findings.filter((finding) => finding.severity === 'attention');
  const watch = findings.filter((finding) => finding.severity !== 'attention');

  printFindingSection('Attention', attention);
  printFindingSection('Watch', watch);

  if (attention.length === 0 && watch.length === 0) {
    process.stdout.write('Advisory heuristics: no smell hits in current diff\n');
    process.stdout.write('Advisory: OK (no architectural attention items)\n');
    return;
  }

  process.stdout.write(`Advisory: attention=${attention.length}, watch=${watch.length}\n`);
  process.stdout.write('Proceed to focused/full verify only after triage\n');
}
