import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { KNIP_CONFIG_PATH } from '../../policy/external-tools/external-tools.mjs';
import { resolveKnipExecutable, runToolCommand } from '../../tools/tool-cli.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from '../profiles/index.mjs';
import { AuditExecutionError, auditResultError } from '../contracts/execution-error.mjs';
import { filterAllowedViolations, loadBaseline } from '../../policy/baselines/shared-baseline.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from '../contracts/result-contract.mjs';

function describeKnipSchema(value) {
  if (!isAuditObject(value) || !Array.isArray(value.issues)) {
    return 'root must be an object with an issues array';
  }
  for (const [index, issue] of value.issues.entries()) {
    if (!isAuditObject(issue) || typeof issue.file !== 'string' || issue.file.length === 0) {
      return `issue ${index} must be an object with a file`;
    }
  }
  return null;
}

function collectIssueViolations(entry) {
  const violations = [];
  const issueTypes = [
    ['unlisted', 'unlisted dependency'],
    ['binaries', 'unlisted binary'],
    ['unresolved', 'unresolved import'],
  ];
  const knownKeys = new Set(['file', ...issueTypes.map(([key]) => key)]);

  for (const [key, label] of issueTypes) {
    for (const issue of entry[key] ?? []) {
      violations.push({
        rule: `knip-${key}`,
        file: entry.file,
        message: `${label}: ${issue.name ?? issue.file ?? issue}`,
      });
    }
  }

  const unknownIssueKeys = Object.entries(entry)
    .filter(([key, value]) => !knownKeys.has(key) && Array.isArray(value) && value.length > 0)
    .map(([key]) => key);
  if (unknownIssueKeys.length > 0) {
    throw new Error(`Knip returned unsupported issue categories: ${unknownIssueKeys.join(', ')}`);
  }

  return violations;
}

export function runKnipCheck({
  baseline = loadBaseline(),
  configPath = KNIP_CONFIG_PATH,
  executable = resolveKnipExecutable(),
  runCommandImpl,
} = {}) {
  if (!executable) {
    return {
      skipped: true,
      violations: [],
      skipReasonId: AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable,
      reason: 'Knip is not installed. Run npm install to provision devDependencies.',
    };
  }

  const result = runToolCommand(
    executable,
    ['--config', configPath, '--reporter', 'json', '--no-progress', '--no-config-hints'],
    { cwd: repoRoot },
    runCommandImpl
  );
  const status = requireAuditCommandStatus(result, { tool: 'Knip scan' });
  const parsed = parseRequiredAuditJson(result.stdout, {
    commandResult: result,
    describeSchema: describeKnipSchema,
    source: 'stdout',
    tool: 'Knip',
  });
  let violations;
  try {
    violations = parsed.issues.flatMap(collectIssueViolations);
  } catch (error) {
    if (error instanceof AuditExecutionError) throw error;
    throw auditResultError(
      'invalid-output',
      error instanceof Error ? error.message : String(error),
      result
    );
  }
  requireFindingStatusConsistency({
    commandResult: result,
    findingCount: violations.length,
    status,
    tool: 'Knip',
  });
  return {
    skipped: false,
    violations: filterAllowedViolations(violations, baseline),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runKnipCheck();

  if (result.skipped) {
    process.stderr.write(`${result.reason ?? 'Knip check skipped'}\n`);
    process.exit(1);
  }

  if (result.violations.length > 0) {
    printViolations('Knip issues found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Knip passed\n');
}
