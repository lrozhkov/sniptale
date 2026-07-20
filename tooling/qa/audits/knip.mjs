import { isExecutedAsScript, printViolations, repoRoot } from '../core/shared.mjs';
import { KNIP_CONFIG_PATH } from '../policy/index.mjs';
import { resolveKnipExecutable, runToolCommand } from '../tools/tool-cli.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from './profiles/index.mjs';
import { AuditExecutionError, auditResultError } from './execution-error.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from './result-contract.mjs';

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
    ['dependencies', 'unused dependency'],
    ['devDependencies', 'unused dev dependency'],
    ['optionalPeerDependencies', 'unused optional peer dependency'],
    ['unlisted', 'unlisted dependency'],
    ['binaries', 'unlisted binary'],
    ['unresolved', 'unresolved import'],
    ['exports', 'unused export'],
    ['types', 'unused exported type'],
    ['nsExports', 'unused namespace export'],
    ['nsTypes', 'unused namespace type'],
    ['files', 'unused file'],
    ['duplicates', 'duplicate export'],
    ['enumMembers', 'unused enum member'],
    ['namespaceMembers', 'unused namespace member'],
    ['catalog', 'catalog issue'],
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
    violations,
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
