import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript } from '../../runtime/process/shared-cli.mjs';
import { resolveScopedTargetFiles } from '../../runtime/scope/target-files.helpers.mjs';
import {
  collectRenameSourceByTarget,
  isImportOrMockOnlyDiffFile,
} from '../../analysis/imports/import-only-diff/check.mjs';
import { collectChangedTargets } from '../../runtime/scope/changed-targets.helpers.mjs';
import { runScopedRuleCli } from '../../composition/runtime/scoped-rule-cli.mjs';
import {
  isProductSourcePath,
  normalizeRepoSrcPath,
} from '../../analysis/repository/src-production-targets.mjs';
import { readHeadFileTexts } from '../../analysis/git/git-head-sources.mjs';
import { collectTaskTopologySourceByTarget } from '../../composition/preflight/task-topology-lineage.mjs';
import { applyRepositoryFindingBaseline } from '../../policy/baselines/repository-finding-baseline.mjs';

const REPOSITORY_BASELINE_PATH = 'tooling/configs/qa/domain-fixture-repository-baseline.json';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const DOMAIN_TYPE_PATTERN =
  /^(?:VideoProject|ScenarioProject|VideoProjectEntry|ScenarioProjectEntry|WebSnapshotRecord|RuntimeMessage|Process\w+Message|Save\w+Message|Backup\w+Manifest|MediaHubBackupMetadata)$/u;
const DOMAIN_TEST_INTENT_PATTERN =
  /\b(?:video|scenario) project\b|\bweb snapshot\b|\bruntime message\b|\b(?:backup|media hub)\b/iu;
const INTENTIONAL_INVALID_PATTERN = /\b(?:invalid|malformed|boundary|corrupt|broken)\b/iu;
// QA_RULE_CONTRACT_REQUIRED: true

function normalizePath(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const relativePath = path.relative(process.cwd(), absolutePath).replaceAll(path.sep, '/');
  return normalizeRepoSrcPath(relativePath);
}

function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

function collectTestFiles(explicitFiles = []) {
  return collectCodeFiles(explicitFiles).filter(isTestFile);
}

function createViolation(rule, file, line, message) {
  return { rule, file, line, message };
}

function hasInvalidFixtureIntentPath(relativePath) {
  return INTENTIONAL_INVALID_PATTERN.test(relativePath);
}

function getOwningTestTitle(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ((ts.isIdentifier(current.expression) && ['it', 'test'].includes(current.expression.text)) ||
        (ts.isPropertyAccessExpression(current.expression) &&
          ts.isIdentifier(current.expression.expression) &&
          ['it', 'test'].includes(current.expression.expression.text)))
    ) {
      const title = current.arguments[0];
      return title && ts.isStringLiteralLike(title) ? title.text : '';
    }
    current = current.parent;
  }
  return '';
}

function shouldCheckLine(relativePath, lineNumber, context) {
  if (!context?.changedLineMap) {
    return true;
  }
  if (context.addedFiles?.has(relativePath) || context.untrackedFiles?.has(relativePath)) {
    return true;
  }
  const changedLines = context.changedLineMap.get(relativePath);
  return changedLines == null ? true : changedLines.has(lineNumber);
}

function collectSourceFindings(relativePath, source, context) {
  const findings = [];
  if (hasInvalidFixtureIntentPath(relativePath)) {
    return findings;
  }
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isAsExpression(node)) {
      const title = getOwningTestTitle(node);
      const typeText = node.type.getText(sourceFile).replaceAll(/\s+/gu, '');
      const isDomainType = DOMAIN_TYPE_PATTERN.test(typeText);
      const isDomainNever =
        node.type.kind === ts.SyntaxKind.NeverKeyword && DOMAIN_TEST_INTENT_PATTERN.test(title);
      const lineNumber =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (
        (isDomainType || isDomainNever) &&
        !INTENTIONAL_INVALID_PATTERN.test(title) &&
        shouldCheckLine(relativePath, lineNumber, context)
      ) {
        findings.push({
          identity: `${title}\u0000${isDomainType ? typeText : 'never'}`,
          violation: createViolation(
            'domain-fixture-realism',
            relativePath,
            lineNumber,
            [
              'Valid domain fixtures should use builders/factories instead of broad casts;',
              'reserve casts for explicit malformed-boundary tests.',
            ].join(' ')
          ),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function collectSourceViolations(relativePath, source, context) {
  return collectSourceFindings(relativePath, source, context).map(({ violation }) => violation);
}

export function collectDomainFixtureRealismViolations(files, context = {}) {
  return files.flatMap((file) => {
    const relativePath = normalizePath(file);
    if (!isProductSourcePath(relativePath) || !isTestFile(relativePath)) {
      return [];
    }
    return collectSourceViolations(relativePath, fs.readFileSync(file, 'utf8'), context);
  });
}

function collectPreviousFindings(relativePath) {
  const renameSource =
    collectRenameSourceByTarget().get(relativePath) ??
    collectTaskTopologySourceByTarget().get(relativePath);
  const paths = renameSource ? [renameSource, relativePath] : [relativePath];
  const sources = readHeadFileTexts(paths);
  const source = (renameSource ? sources.get(renameSource) : null) ?? sources.get(relativePath);
  return source == null ? [] : collectSourceFindings(relativePath, source, {});
}

function filterNetNewWorkspaceViolations(targetFiles, changedTargets) {
  const violations = [];
  for (const file of targetFiles) {
    const relativePath = normalizePath(file);
    const source = fs.readFileSync(file, 'utf8');
    const current = collectSourceFindings(relativePath, source, {});
    const changed = collectSourceFindings(relativePath, source, {
      addedFiles: new Set(changedTargets.addedFiles),
      changedLineMap: changedTargets.changedLineMap,
      untrackedFiles: changedTargets.untrackedFiles,
    });
    const previousCounts = new Map();
    for (const { identity } of collectPreviousFindings(relativePath)) {
      previousCounts.set(identity, (previousCounts.get(identity) ?? 0) + 1);
    }
    const excessCounts = new Map();
    for (const { identity } of current) {
      excessCounts.set(identity, (excessCounts.get(identity) ?? 0) + 1);
    }
    for (const [identity, count] of excessCounts) {
      excessCounts.set(identity, Math.max(0, count - (previousCounts.get(identity) ?? 0)));
    }
    for (const finding of changed) {
      const excess = excessCounts.get(finding.identity) ?? 0;
      if (excess > 0) {
        violations.push(finding.violation);
        excessCounts.set(finding.identity, excess - 1);
      }
    }
  }
  return violations;
}

export function runDomainFixtureRealismCheck({ files = [], scope = 'workspace' } = {}) {
  const changedTargets = scope === 'repo-wide' ? null : collectChangedTargets({ scope });
  const targets = resolveScopedTargetFiles({
    collectFiles: collectTestFiles,
    files,
    scope,
  });
  const relativeFiles =
    scope === 'repo-wide'
      ? targets.relativeFiles
      : targets.relativeFiles.filter((file) => !isImportOrMockOnlyDiffFile(file));
  const targetFiles = relativeFiles.map((file) => path.join(process.cwd(), file));
  const currentViolations =
    changedTargets == null
      ? collectDomainFixtureRealismViolations(targetFiles)
      : filterNetNewWorkspaceViolations(targetFiles, changedTargets);
  const baseline =
    scope === 'repo-wide'
      ? applyRepositoryFindingBaseline({
          baselinePath: REPOSITORY_BASELINE_PATH,
          controlId: 'qa.rule.domain-fixture-realism',
          findings: currentViolations,
        })
      : null;
  return {
    skipped: targetFiles.length === 0,
    files: relativeFiles,
    violations: baseline?.violations ?? currentViolations,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = runScopedRuleCli({
    messages: {
      blockingViolations: 'Domain fixture realism violations found:',
      repoWidePassed: 'Domain fixture realism repo-wide guard passed\n',
      repoWideSkipped: 'Domain fixture realism repo-wide check skipped: no test files\n',
      reportViolations: 'Domain fixture realism report found violations:',
      workspacePassed: 'Domain fixture realism guard passed\n',
      workspaceSkipped: 'Domain fixture realism check skipped: no changed test files\n',
    },
    runCheck: runDomainFixtureRealismCheck,
  });
}
