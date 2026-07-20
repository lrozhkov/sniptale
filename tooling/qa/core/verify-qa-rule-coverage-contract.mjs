import fs from 'node:fs';
import path from 'node:path';

import { collectRecursiveFiles } from './recursive-files.mjs';
import { collectRegisteredQaTools } from './qa-steps/definitions.mjs';
import { fromRelativePath, isExecutedAsScript, repoRoot } from './shared.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';
import { runScopedRuleCli } from './scoped-rule-cli.mjs';

const VERIFY_RULE_PATTERN =
  /^tooling\/qa\/(?:core|guards\/(?:architecture|quality|security))\/verify-[^./]+\.(?:[cm]?[jt]s)$/u;
const ORCHESTRATION_RULE_NAMES = new Set([
  'all',
  'build',
  'closeout',
  'focused',
  'harness',
  'release',
  'prettier',
  'typecheck',
  'unit-tests',
  'audit',
  'eslint',
  'oxlint',
  'sonarjs',
  'run-metrics',
  'test-coverage',
  'dead-exports',
  'quality-gates',
  'runners',
]);
const VALIDATION_MANIFEST_PATH = 'tooling/configs/qa/validation-manifest.json';
// QA_RULE_CONTRACT_REQUIRED: true

function createViolation(rule, file, line, message) {
  return { rule, file, line, message };
}

function normalizePath(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const relativePath = path.relative(process.cwd(), absolutePath).replaceAll(path.sep, '/');
  const toolingIndex = relativePath.indexOf('tooling/qa/');
  return toolingIndex >= 0 ? relativePath.slice(toolingIndex) : relativePath;
}

function collectVerifyRuleFiles(explicitFiles = []) {
  if (explicitFiles.length > 0) {
    return explicitFiles
      .map(normalizePath)
      .filter((file) => VERIFY_RULE_PATTERN.test(file) && fs.existsSync(fromRelativePath(file)));
  }

  return collectRecursiveFiles(fromRelativePath('tooling/qa'), {
    baseDir: repoRoot,
    predicate: (file) => VERIFY_RULE_PATTERN.test(file),
  });
}

function readValidationTools() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), VALIDATION_MANIFEST_PATH), 'utf8')
  );
  return new Set(manifest.tools.map((entry) => entry.tool));
}

function isGuardrailRuleSource(source) {
  return (
    /QA_RULE_CONTRACT_REQUIRED\s*[:=]\s*true/u.test(source) ||
    /runGuardrailCheck/u.test(source) ||
    /runIfExecutedAsScript/u.test(source)
  );
}

function isOrchestrationRule(relativePath) {
  const basename = path.basename(relativePath).replace(/\.(?:[cm]?[jt]s)$/u, '');
  return (
    basename.startsWith('verify-') && ORCHESTRATION_RULE_NAMES.has(basename.slice('verify-'.length))
  );
}

function collectSourceContractViolations(relativePath, source) {
  if (isOrchestrationRule(relativePath) || !isGuardrailRuleSource(source)) {
    return [];
  }

  const violations = [];
  if (!/export\s+(?:function\s+collect\w*Violations|\{\s*collect\w*Violations)/u.test(source)) {
    violations.push(
      createViolation(
        'qa-rule-contract-missing-collector',
        relativePath,
        1,
        'Guardrail scripts must expose a collect*Violations API for fixture tests and wrappers.'
      )
    );
  }
  if (!/export\s+function\s+run\w*Check/u.test(source)) {
    violations.push(
      createViolation(
        'qa-rule-contract-missing-runner',
        relativePath,
        1,
        'Guardrail scripts must expose a run*Check({ files, scope }) wrapper API.'
      )
    );
  }
  if (!/(?:runIfExecutedAsScript|isExecutedAsScript)\s*\(/u.test(source)) {
    violations.push(
      createViolation(
        'qa-rule-contract-missing-cli',
        relativePath,
        1,
        'Guardrail scripts must expose a CLI path for direct debug and report-only runs.'
      )
    );
  }
  return violations;
}

export function collectQaRuleCoverageContractViolations(files) {
  const validationTools = readValidationTools();
  const registeredTools = collectRegisteredQaTools();
  const violations = [];

  for (const file of files) {
    const relativePath = normalizePath(file);
    const tool = path.basename(relativePath);
    const source = fs.readFileSync(file, 'utf8');
    if (!isGuardrailRuleSource(source)) {
      continue;
    }
    violations.push(...collectSourceContractViolations(relativePath, source));

    if (!validationTools.has(tool)) {
      violations.push(
        createViolation(
          'qa-rule-contract-missing-validation',
          relativePath,
          1,
          'QA rule scripts must be listed in validation-manifest.json with fixture proof.'
        )
      );
    }
    if (!registeredTools.has(tool)) {
      violations.push(
        createViolation(
          'qa-rule-contract-missing-registry',
          relativePath,
          1,
          'QA rule scripts must have a wrapper/evidence registry lane decision.'
        )
      );
    }
  }

  return violations;
}

export function runQaRuleCoverageContractCheck({ files = [], scope = 'workspace' } = {}) {
  const targets = resolveScopedTargetFiles({
    collectFiles: collectVerifyRuleFiles,
    files,
    scope,
  });
  return {
    skipped: targets.files.length === 0,
    files: targets.relativeFiles,
    violations: collectQaRuleCoverageContractViolations(targets.files),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = runScopedRuleCli({
    messages: {
      blockingViolations: 'QA rule coverage contract violations found:',
      repoWidePassed: 'QA rule coverage contract repo-wide guard passed\n',
      repoWideSkipped: 'QA rule coverage contract repo-wide check skipped: no rule files\n',
      reportViolations: 'QA rule coverage contract report found violations:',
      workspacePassed: 'QA rule coverage contract guard passed\n',
      workspaceSkipped: 'QA rule coverage contract check skipped: no changed rule files\n',
    },
    runCheck: runQaRuleCoverageContractCheck,
  });
}
