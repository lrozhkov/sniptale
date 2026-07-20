import fs from 'node:fs';
import ts from 'typescript';

import { fromRelativePath } from './shared.mjs';
import { QUALITY_LIMITS } from './quality.config.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;
const UI_SURFACE_OWNERS = [
  'content',
  'popup',
  'settings',
  'gallery',
  'design-system',
  'editor',
  'video-editor',
  'scenario-editor',
  'web-snapshot-viewer',
];
const UX_DEFERRED_OWNERS = [
  'content/components',
  'popup',
  'settings',
  'gallery',
  'editor',
  'video-editor',
  'scenario-editor',
  'design-system',
  'web-snapshot-viewer',
];
const FLOATING_UI_PATTERN = /(?:floating|popover|toolbar|layers|panel|modal|menu|surface)/u;
const CAPABILITY_SURFACE_PATTERN = /(?:command|toolbar|tool-commands|builder|compact|inspector)/u;
const STATE_AUTHORITY_PATTERN = /(?:store|state|controller|actions|runtime|storage|db|session)/u;
const HIDDEN_INPUT_PATTERN = /(?:hidden|file-input|confirm|dialog|inspector|sidebar-controller)/u;
const PUBLIC_API_PATTERN = /(?:public-api|contracts|messages|packages\/.*\/index\.ts$)/u;
const RUNTIME_SECURITY_PREFIXES = [
  'apps/extension/src/background/',
  'apps/extension/src/offscreen/',
  'apps/extension/src/contracts/messaging/',
  'apps/extension/src/platform/security/',
  'packages/runtime-contracts/src/messaging/',
  'packages/platform/src/security/',
  'apps/extension/src/composition/persistence/',
  'apps/extension/src/content/runtime',
];
const BOUNDARY_PAYLOAD_PATTERN =
  /(?:runtime|message|schema|contract|parser|import|backup|manifest|zip|package|snapshot|payload)/u;
const UI_SURFACE_FILE_PATTERN = /\.(?:ts|tsx|css)$/u;

function hasOwnerPrefix(file, owners) {
  return owners.some(
    (owner) => file.startsWith(`src/${owner}/`) || file.startsWith(`apps/extension/src/${owner}/`)
  );
}

function isRuntimeSecurityFile(file) {
  return RUNTIME_SECURITY_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function existingFile(relativePath) {
  const absolutePath = fromRelativePath(relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
}

function collectChangedTests(targetFiles) {
  return targetFiles.filter((file) => TEST_FILE_PATTERN.test(file));
}

function collectUiSurfaceFiles(codeFiles) {
  return codeFiles.filter(
    (file) => hasOwnerPrefix(file, UI_SURFACE_OWNERS) && UI_SURFACE_FILE_PATTERN.test(file)
  );
}

function createRiskHint(label, detail) {
  return `risk checklist: ${label}: ${detail}`;
}

export function collectRiskChecklistHints({
  targetFiles = [],
  codeFiles = [],
  untrackedFiles = [],
}) {
  if (targetFiles.length === 0) {
    return [];
  }

  const hints = [];
  if (codeFiles.some((file) => STATE_AUTHORITY_PATTERN.test(file))) {
    hints.push(createRiskHint('state authority', 'name authoritative/advisory/disposable state'));
  }
  if (collectUiSurfaceFiles(codeFiles).length > 0) {
    hints.push(createRiskHint('UI parity', 'map old behavior to new surface and proof'));
    hints.push(createRiskHint('visual states', 'cover hover/active/disabled/open/empty/overflow'));
  }
  if (codeFiles.some((file) => HIDDEN_INPUT_PATTERN.test(file))) {
    hints.push(createRiskHint('hidden inputs', 'prove hidden inputs/dialogs stay mounted'));
  }
  if (codeFiles.some((file) => PUBLIC_API_PATTERN.test(file))) {
    hints.push(createRiskHint('public API', 'include consumers and tests'));
  }

  const untrackedTests = untrackedFiles.filter((file) => TEST_FILE_PATTERN.test(file));
  if (untrackedTests.length > 0) {
    hints.push(createRiskHint('untracked tests', `${untrackedTests.length} will be included`));
  }

  return hints;
}

export function collectVisualProofHints({ codeFiles = [] }) {
  const uiFiles = collectUiSurfaceFiles(codeFiles).filter((file) => FLOATING_UI_PATTERN.test(file));
  if (uiFiles.length === 0) {
    return [];
  }

  return [
    `visual proof plan recommended: ${uiFiles.slice(0, 3).join(', ')} changed; capture key open/closed/overflow states`,
  ];
}

export function collectCapabilityLossHints({ targetFiles = [], codeFiles = [] }) {
  const capabilityFiles = codeFiles.filter((file) => CAPABILITY_SURFACE_PATTERN.test(file));
  if (capabilityFiles.length === 0) {
    return [];
  }

  const changedTests = collectChangedTests(targetFiles);
  if (changedTests.length >= Math.max(1, Math.ceil(capabilityFiles.length / 4))) {
    return [];
  }

  return [
    `capability-loss risk: ${capabilityFiles.slice(0, 3).join(', ')} changed with limited coverage-table proof`,
  ];
}

function nodeLineSpan(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return end - start + 1;
}

function isNamedTestCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['it', 'test', 'describe'].includes(node.expression.text)
  );
}

function collectLongTestBodies(sourceFile) {
  const limit = Math.floor(QUALITY_LIMITS.maxFunctionLines * 0.8);
  const findings = [];

  function visit(node) {
    if (isNamedTestCall(node) && nodeLineSpan(sourceFile, node) >= limit) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      findings.push(`test body near size limit at line ${line}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings.slice(0, 2);
}

export function collectTestShapeHints({ targetFiles = [] }) {
  const warningFileLines = Math.floor(QUALITY_LIMITS.maxFileLines * 0.8);
  const hints = [];

  for (const file of collectChangedTests(targetFiles)) {
    if (!existingFile(file)) {
      continue;
    }

    const sourceText = fs.readFileSync(fromRelativePath(file), 'utf8');
    const lineCount = sourceText.split(/\r?\n/u).length;
    if (lineCount >= warningFileLines) {
      hints.push(`test shape risk: ${file}: ${lineCount} lines`);
    }

    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
    hints.push(
      ...collectLongTestBodies(sourceFile).map((detail) => `test shape risk: ${file}: ${detail}`)
    );
  }

  return hints.slice(0, 6);
}

export function collectDeterministicProofHints({ codeFiles = [] }) {
  if (codeFiles.length === 0) {
    return [];
  }

  const hints = [];
  if (codeFiles.some(isRuntimeSecurityFile)) {
    hints.push(
      createRiskHint(
        'runtime/security proof',
        'cover wrong sender/capability, duplicate/replay, stale result, and rollback/failure'
      )
    );
  }
  if (codeFiles.some((file) => BOUNDARY_PAYLOAD_PATTERN.test(file))) {
    hints.push(
      createRiskHint(
        'boundary payload proof',
        'cover malformed payloads, oversize resources, parser drift, and fixed-point artifacts'
      )
    );
  }
  if (codeFiles.some((file) => hasOwnerPrefix(file, UX_DEFERRED_OWNERS))) {
    hints.push(
      createRiskHint(
        'UX-deferred proof',
        'track stale visual state, failure feedback, hotkey/i18n, and disabled/empty paths as advisory'
      )
    );
  }

  return hints;
}
