import { isIgnoredRelativePath, printViolations, toRelativePath } from './shared.mjs';
import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';

export function printOk(label, detail = '') {
  process.stdout.write(`${label}: OK${detail ? ` (${detail})` : ''}\n`);
}

export function printFailure(label, message) {
  process.stderr.write(`${label}: ${message}\n`);
}

export function printAdvisory(label, detail = '') {
  process.stdout.write(`${label}: advisory${detail ? ` (${detail})` : ''}\n`);
}

function resolveChangedWorkspaceFiles() {
  return collectChangedTargets({ scope: 'workspace' })
    .changedFiles.map(toRelativePath)
    .filter((file) => !isIgnoredRelativePath(file))
    .sort();
}

export function resolveFocusedFiles(explicitFiles = []) {
  if (explicitFiles.length > 0) {
    return [...new Set(explicitFiles.map(toRelativePath))].filter(
      (file) => !isIgnoredRelativePath(file)
    );
  }

  return resolveChangedWorkspaceFiles();
}

export function exitOnViolations(label, header, result) {
  if (result.violations.length > 0) {
    printFailure(label, header.replace(/:\s*$/u, ''));
    printViolations(header, result.violations);
    process.exit(1);
  }

  if (result.skipped) {
    printOk(label, 'no matching files');
  } else {
    printOk(label);
  }
}

export function exitOnPrettierFailures(failures) {
  if (failures.length === 0) {
    printOk('Prettier');
    return;
  }

  printFailure('Prettier', 'formatting violations found');
  process.stderr.write('Prettier formatting violations found:\n\n');
  for (const file of failures) {
    process.stderr.write(`- ${file}\n`);
  }
  process.exit(1);
}

export function exitOnLineLengthViolations(result) {
  if (result.violations.length > 0) {
    printFailure('Changed-line readability', 'violations found');
    printViolations('Changed-line length violations found:', result.violations);
    process.exit(1);
  }

  printOk('Changed-line readability', result.skipped ? 'no changed code files' : '');
}

export function exitOnSecurityViolations(violations) {
  if (violations.length === 0) {
    printOk('Security');
    return;
  }

  printFailure('Security', 'violations found');
  printViolations('Security violations found:', violations);
  process.exit(1);
}

function createSkippedResult() {
  return {
    skipped: true,
    violations: [],
  };
}

export function runCodeStep(codeFiles, runner) {
  return codeFiles.length === 0 ? createSkippedResult() : runner();
}

export function exitOnProcessFailure(label, result) {
  if (result.status !== 0) {
    printFailure(label, 'failed');
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  printOk(label);
}
