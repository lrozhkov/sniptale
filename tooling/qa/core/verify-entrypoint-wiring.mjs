/**
 * Entrypoint wiring guardrail.
 * Keeps runtime/page entrypoints thin by blocking direct browser transport and raw messaging seams.
 */

import fs from 'node:fs';

import { collectCodeFiles, isExecutedAsScript, printViolations } from './shared.mjs';
import { toRelativePathForRoot } from './repo-root-relative-path.mjs';
import { getEntrypointRuntimePathPattern } from './runtime-topology.mjs';

const ENTRYPOINT_RUNTIME_PATTERN = getEntrypointRuntimePathPattern();
const ENTRYPOINT_NAME_PATTERN = /\/(?:index|App|PopupApp)\.[cm]?[jt]sx?$/u;

const DIRECT_BROWSER_TRANSPORT_PATTERN = /\bchrome\.[A-Za-z0-9_.]+\s*\(/u;
const BROWSER_LISTENER_PATTERN = /\bchrome\.[A-Za-z0-9_.]+\.addListener\s*\(/u;
const RUNTIME_MESSAGING_IMPORT_PATTERN = /from\s+['"][^'"]*shared\/runtime-messaging['"]/u;
const MESSAGE_CONTRACT_IMPORT_PATTERN =
  /from\s+['"][^'"]*shared\/contracts\/messaging-contracts['"]/u;

function createViolation(rule, file, message, line = undefined) {
  return { rule, file, line, message };
}

function findLineNumber(text, pattern) {
  const match = pattern.exec(text);
  if (!match || match.index == null) {
    return undefined;
  }

  return text.slice(0, match.index).split(/\r?\n/u).length;
}

export function collectEntrypointWiringViolations(files) {
  return collectEntrypointWiringViolationsWithOptions(files);
}

export function collectEntrypointWiringViolationsWithOptions(files, { root = null } = {}) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePathForRoot(filePath, root);
    if (!isEntrypointFile(relativePath)) {
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    violations.push(...collectFileViolations(relativePath, text));
  }

  return violations;
}

function isEntrypointFile(relativePath) {
  return (
    ENTRYPOINT_RUNTIME_PATTERN.test(relativePath) && ENTRYPOINT_NAME_PATTERN.test(relativePath)
  );
}

function collectFileViolations(relativePath, text) {
  const violations = [];

  if (BROWSER_LISTENER_PATTERN.test(text) || DIRECT_BROWSER_TRANSPORT_PATTERN.test(text)) {
    const pattern = BROWSER_LISTENER_PATTERN.test(text)
      ? BROWSER_LISTENER_PATTERN
      : DIRECT_BROWSER_TRANSPORT_PATTERN;
    violations.push(
      createViolation(
        'entrypoint-browser-transport',
        relativePath,
        [
          'Move direct browser transport and listener registration out of entrypoints',
          'into wiring or adapter modules.',
        ].join(' '),
        findLineNumber(text, pattern)
      )
    );
  }

  if (RUNTIME_MESSAGING_IMPORT_PATTERN.test(text)) {
    violations.push(
      createViolation(
        'entrypoint-runtime-messaging',
        relativePath,
        [
          'Entrypoints should not import shared/runtime-messaging directly;',
          'delegate messaging bootstrap to a runtime wiring module.',
        ].join(' '),
        findLineNumber(text, RUNTIME_MESSAGING_IMPORT_PATTERN)
      )
    );
  }

  if (MESSAGE_CONTRACT_IMPORT_PATTERN.test(text)) {
    violations.push(
      createViolation(
        'entrypoint-message-contracts',
        relativePath,
        [
          'Entrypoints should not parse runtime payloads directly;',
          'move boundary parsing into a dedicated boundary owner module.',
        ].join(' '),
        findLineNumber(text, MESSAGE_CONTRACT_IMPORT_PATTERN)
      )
    );
  }

  return violations;
}

export function runEntrypointWiringCheck({ files = [], root = null } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRelativePathForRoot(file, root)),
    violations: collectEntrypointWiringViolationsWithOptions(targetFiles, { root }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runEntrypointWiringCheck();

  if (result.violations.length > 0) {
    printViolations('Entrypoint wiring guardrail violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Entrypoint wiring guardrail passed\n');
}
