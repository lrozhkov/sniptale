import fs from 'node:fs';

import { readHeadFileText } from '../../analysis/git/git-head-sources.mjs';
import { createSourceFile, ts } from '../../analysis/structural-risk/ast.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
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
const UI_SOURCE_FILE_PATTERN = /\.(?:[jt]sx?|css)$/u;

function hasOwnerPrefix(file, owners) {
  return owners.some(
    (owner) => file.startsWith(`src/${owner}/`) || file.startsWith(`apps/extension/src/${owner}/`)
  );
}

function isRuntimeSecurityFile(file) {
  return RUNTIME_SECURITY_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function collectChangedTests(targetFiles) {
  return targetFiles.filter((file) => TEST_FILE_PATTERN.test(file) && fs.existsSync(file));
}

function collectProductionCodeFiles(codeFiles) {
  return codeFiles.filter((file) => !TEST_FILE_PATTERN.test(file));
}

function readCurrentSource(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function normalizeViewText(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function appendJsxContainerSignature(node, sourceFile, signature) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    signature.push(`jsx:${node.tagName.getText(sourceFile)}`);
  } else if (ts.isJsxFragment(node)) {
    signature.push('jsx:fragment');
  }
}

function collectNestedImperativeViewSignatures(node, sourceFile, signature) {
  if (appendImperativeViewSignature(node, sourceFile, signature)) return;
  ts.forEachChild(node, (child) =>
    collectNestedImperativeViewSignatures(child, sourceFile, signature)
  );
}

function appendJsxAttributeSignature(node, sourceFile, signature) {
  if (ts.isJsxAttribute(node)) {
    const name = node.name.getText(sourceFile);
    if (/^on[A-Z]/u.test(name)) {
      ts.forEachChild(node, (child) =>
        collectNestedImperativeViewSignatures(child, sourceFile, signature)
      );
    } else {
      signature.push(
        `attr:${name}=${normalizeViewText(node.initializer?.getText(sourceFile) ?? '')}`
      );
    }
    return true;
  }
  if (!ts.isJsxSpreadAttribute(node)) return false;
  signature.push(`spread:${normalizeViewText(node.expression.getText(sourceFile))}`);
  return true;
}

function appendJsxContentSignature(node, sourceFile, signature) {
  if (ts.isJsxText(node)) {
    const text = normalizeViewText(node.text);
    if (text) signature.push(`text:${text}`);
    return true;
  }
  if (!ts.isJsxExpression(node)) return false;
  const expression = node.expression?.getText(sourceFile);
  if (expression) signature.push(`expression:${normalizeViewText(expression)}`);
  return true;
}

function appendImperativeViewSignature(node, sourceFile, signature) {
  const isRenderCall =
    ts.isCallExpression(node) &&
    /(?:^|\.)(?:createElement|createPortal|render)$/u.test(node.expression.getText(sourceFile));
  if (isRenderCall) {
    signature.push(`render:${normalizeViewText(node.getText(sourceFile))}`);
    return true;
  }
  const isStyleTemplate =
    ts.isTaggedTemplateExpression(node) &&
    /^(?:css|styled(?:\.|$))/u.test(node.tag.getText(sourceFile));
  if (!isStyleTemplate) return false;
  signature.push(`style:${normalizeViewText(node.getText(sourceFile))}`);
  return true;
}

function createViewSignature(file, source, version) {
  if (source === null) return [];
  if (file.endsWith('.css')) return [`css:${normalizeViewText(source)}`];
  const sourceFile = createSourceFile(file, source, { version });
  const signature = [];
  function visit(node) {
    if (appendJsxAttributeSignature(node, sourceFile, signature)) return;
    if (appendJsxContentSignature(node, sourceFile, signature)) return;
    if (appendImperativeViewSignature(node, sourceFile, signature)) return;
    appendJsxContainerSignature(node, sourceFile, signature);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return signature;
}

function hasViewBearingChange(file, getPreviousSource) {
  const currentSignature = createViewSignature(file, readCurrentSource(file), 'current');
  const previousSignature = createViewSignature(file, getPreviousSource(file), 'HEAD');
  return (
    (currentSignature.length > 0 || previousSignature.length > 0) &&
    JSON.stringify(currentSignature) !== JSON.stringify(previousSignature)
  );
}

function collectUiOwnerFiles(codeFiles) {
  return codeFiles.filter(
    (file) => hasOwnerPrefix(file, UI_SURFACE_OWNERS) && UI_SOURCE_FILE_PATTERN.test(file)
  );
}

function collectUiSurfaceFiles(codeFiles, getPreviousSource = readHeadFileText) {
  return collectUiOwnerFiles(collectProductionCodeFiles(codeFiles)).filter((file) =>
    hasViewBearingChange(file, getPreviousSource)
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
  const productionCodeFiles = collectProductionCodeFiles(codeFiles);
  const uiOwnerFiles = collectUiOwnerFiles(productionCodeFiles);
  const uiSurfaceFiles = collectUiSurfaceFiles(productionCodeFiles);
  if (productionCodeFiles.some((file) => STATE_AUTHORITY_PATTERN.test(file))) {
    hints.push(createRiskHint('state authority', 'name authoritative/advisory/disposable state'));
  }
  if (uiSurfaceFiles.length > 0) {
    hints.push(createRiskHint('UI parity', 'map old behavior to new surface and proof'));
    hints.push(createRiskHint('visual states', 'cover hover/active/disabled/open/empty/overflow'));
  } else if (uiOwnerFiles.some((file) => STATE_AUTHORITY_PATTERN.test(file))) {
    hints.push(
      createRiskHint('UI wiring', 'prove state, action, and lifecycle bindings behaviorally')
    );
  }
  if (productionCodeFiles.some((file) => HIDDEN_INPUT_PATTERN.test(file))) {
    hints.push(createRiskHint('hidden inputs', 'prove hidden inputs/dialogs stay mounted'));
  }
  if (productionCodeFiles.some((file) => PUBLIC_API_PATTERN.test(file))) {
    hints.push(createRiskHint('public API', 'include consumers and tests'));
  }

  const untrackedTests = untrackedFiles.filter((file) => TEST_FILE_PATTERN.test(file));
  if (untrackedTests.length > 0) {
    hints.push(createRiskHint('untracked tests', `${untrackedTests.length} will be included`));
  }

  return hints;
}

export function collectVisualProofHints({ codeFiles = [], getPreviousSource = readHeadFileText }) {
  const uiFiles = collectUiSurfaceFiles(codeFiles, getPreviousSource).filter((file) =>
    FLOATING_UI_PATTERN.test(file)
  );
  if (uiFiles.length === 0) {
    return [];
  }

  return [
    `visual proof plan recommended: ${uiFiles.slice(0, 3).join(', ')} changed; capture key open/closed/overflow states`,
  ];
}

export function collectCapabilityLossHints({ targetFiles = [], codeFiles = [] }) {
  const capabilityFiles = collectProductionCodeFiles(codeFiles).filter((file) =>
    CAPABILITY_SURFACE_PATTERN.test(file)
  );
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

export function collectDeterministicProofHints({ codeFiles = [] }) {
  if (codeFiles.length === 0) {
    return [];
  }

  const hints = [];
  const productionCodeFiles = collectProductionCodeFiles(codeFiles);
  if (productionCodeFiles.some(isRuntimeSecurityFile)) {
    hints.push(
      createRiskHint(
        'runtime/security proof',
        'cover wrong sender/capability, duplicate/replay, stale result, and rollback/failure'
      )
    );
  }
  if (productionCodeFiles.some((file) => BOUNDARY_PAYLOAD_PATTERN.test(file))) {
    hints.push(
      createRiskHint(
        'boundary payload proof',
        'cover malformed payloads, oversize resources, parser drift, and fixed-point artifacts'
      )
    );
  }
  if (productionCodeFiles.some((file) => hasOwnerPrefix(file, UX_DEFERRED_OWNERS))) {
    hints.push(
      createRiskHint(
        'UX-deferred proof',
        'track stale visual state, failure feedback, hotkey/i18n, and disabled/empty paths as advisory'
      )
    );
  }

  return hints;
}
