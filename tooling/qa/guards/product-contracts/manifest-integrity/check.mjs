/**
 * Manifest integrity guardrail.
 * Ensures repo-owned manifest paths and web_accessible_resources resolve to real files.
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';
import {
  collectEffectRuntimeSandboxViolations,
  collectSandboxEntries,
} from '../manifest/manifest-integrity-sandbox.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const OFFSCREEN_DOCUMENT_DTO_PATH =
  'apps/extension/src/background/offscreen-document/create-options.ts';
const EXPECTED_ACTION_DEFAULT_TITLE = 'Open Sniptale';
const EXPECTED_EXTENSION_PAGES_CSP = "script-src 'self'; object-src 'self';";
const PASS_MESSAGE = 'Manifest integrity passed';
const EXPECTED_OFFSCREEN_REASONS = {
  createPrivacyErasureOffscreenDocumentOptions: ['LOCAL_STORAGE'],
  createUserMediaOffscreenDocumentOptions: ['USER_MEDIA', 'CLIPBOARD'],
};

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function toAbsolutePath(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}

function manifestEntryExists(rootDir, entryPath) {
  if (entryPath.startsWith('src/') || entryPath.startsWith('apps/extension/src/')) {
    return fs.existsSync(toAbsolutePath(rootDir, entryPath));
  }

  return fs.existsSync(toAbsolutePath(rootDir, path.join('apps/extension/public', entryPath)));
}

function createViolation(file, message) {
  return {
    rule: 'manifest-integrity',
    file,
    message,
  };
}

function loadManifest(rootDir, manifestPath) {
  const absolutePath = toAbsolutePath(rootDir, manifestPath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function collectManifestEntries(manifest) {
  return [
    ...collectBackgroundEntries(manifest),
    ...collectActionEntries(manifest),
    ...collectSandboxEntries(manifest),
    ...collectIconEntries(manifest),
    ...collectAdditionalPageEntries(manifest),
  ];
}

function collectBackgroundEntries(manifest) {
  return manifest.background?.service_worker
    ? [{ path: manifest.background.service_worker, label: 'background.service_worker' }]
    : [];
}

function collectActionEntries(manifest) {
  return [
    ...(manifest.action?.default_popup
      ? [{ path: manifest.action.default_popup, label: 'action.default_popup' }]
      : []),
    ...Object.entries(manifest.action?.default_icon ?? {}).map(([iconSize, iconPath]) => ({
      path: iconPath,
      label: `action.default_icon.${iconSize}`,
    })),
  ];
}

function collectIconEntries(manifest) {
  return Object.entries(manifest.icons ?? {}).map(([iconSize, path]) => ({
    path,
    label: `icons.${iconSize}`,
  }));
}

function collectAdditionalPageEntries(manifest) {
  return [
    ...(manifest.options_ui?.page
      ? [{ path: manifest.options_ui.page, label: 'options_ui.page' }]
      : []),
    ...(manifest.devtools_page ? [{ path: manifest.devtools_page, label: 'devtools_page' }] : []),
    ...(manifest.side_panel?.default_path
      ? [{ path: manifest.side_panel.default_path, label: 'side_panel.default_path' }]
      : []),
    ...Object.entries(manifest.chrome_url_overrides ?? {}).map(([name, page]) => ({
      path: page,
      label: `chrome_url_overrides.${name}`,
    })),
  ];
}

function pathNeedsExistenceCheck(entryPath) {
  return !entryPath.includes('*');
}

function collectManifestTopologyViolations(manifest, manifestFile, rootDir) {
  return [
    ...collectActionTitleViolations(manifest, manifestFile),
    ...collectExtensionCspViolations(manifest, manifestFile),
    ...collectEffectRuntimeSandboxViolations(manifest, manifestFile, createViolation),
    ...collectOffscreenReasonViolations(rootDir, manifestFile),
  ];
}

function collectActionTitleViolations(manifest, manifestFile) {
  if (manifest.action?.default_title !== EXPECTED_ACTION_DEFAULT_TITLE) {
    return [
      createViolation(
        manifestFile,
        `action.default_title must be ${JSON.stringify(EXPECTED_ACTION_DEFAULT_TITLE)}.`
      ),
    ];
  }

  return [];
}

function collectExtensionCspViolations(manifest, manifestFile) {
  if (manifest.content_security_policy?.extension_pages !== EXPECTED_EXTENSION_PAGES_CSP) {
    return [
      createViolation(
        manifestFile,
        `content_security_policy.extension_pages must be ${JSON.stringify(
          EXPECTED_EXTENSION_PAGES_CSP
        )}.`
      ),
    ];
  }

  return [];
}

function collectOffscreenReasonViolations(rootDir, manifestFile) {
  const offscreenDtoPath = toAbsolutePath(rootDir, OFFSCREEN_DOCUMENT_DTO_PATH);
  if (!fs.existsSync(offscreenDtoPath)) {
    return [
      createViolation(
        manifestFile,
        `offscreen document DTO points to a missing repo file: ${OFFSCREEN_DOCUMENT_DTO_PATH}`
      ),
    ];
  }

  const source = fs.readFileSync(offscreenDtoPath, 'utf8');
  const sourceFile = getSourceSnapshot({
    filePath: OFFSCREEN_DOCUMENT_DTO_PATH,
    text: source,
  }).sourceFile;
  const literalConstants = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      let initializer = declaration.initializer;
      while (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer)) {
        initializer = initializer.expression;
      }
      if (ts.isStringLiteral(initializer))
        literalConstants.set(declaration.name.text, initializer.text);
    }
  }
  const actualReasons = new Map();
  const visit = (node, owner = null) => {
    const functionOwner = ts.isFunctionDeclaration(node) && node.name ? node.name.text : owner;
    if (functionOwner && ts.isReturnStatement(node) && node.expression) {
      let expression = node.expression;
      while (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
        expression = expression.expression;
      }
      if (ts.isObjectLiteralExpression(expression)) {
        const reasons = expression.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === 'reasons'
        );
        if (
          reasons &&
          ts.isPropertyAssignment(reasons) &&
          ts.isArrayLiteralExpression(reasons.initializer)
        ) {
          actualReasons.set(
            functionOwner,
            reasons.initializer.elements.map((element) =>
              ts.isIdentifier(element)
                ? literalConstants.get(element.text)
                : ts.isStringLiteral(element)
                  ? element.text
                  : null
            )
          );
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, functionOwner));
  };
  visit(sourceFile);
  return Object.entries(EXPECTED_OFFSCREEN_REASONS).flatMap(([owner, expected]) =>
    JSON.stringify(actualReasons.get(owner)) === JSON.stringify(expected)
      ? []
      : [
          createViolation(
            OFFSCREEN_DOCUMENT_DTO_PATH,
            `${owner} must return the exact offscreen reasons ${JSON.stringify(expected)}.`
          ),
        ]
  );
}

export function collectManifestIntegrityViolations({
  rootDir = repoRoot,
  manifestPath = MANIFEST_PATH,
} = {}) {
  const manifest = loadManifest(rootDir, manifestPath);
  const manifestFile = normalizePath(path.relative(rootDir, toAbsolutePath(rootDir, manifestPath)));
  const violations = [];

  for (const entry of collectManifestEntries(manifest)) {
    if (!pathNeedsExistenceCheck(entry.path)) {
      violations.push(
        createViolation(
          manifestFile,
          `${entry.label} must list concrete files, not wildcard paths: ${entry.path}`
        )
      );
      continue;
    }

    if (manifestEntryExists(rootDir, entry.path)) {
      continue;
    }

    violations.push(
      createViolation(manifestFile, `${entry.label} points to a missing repo file: ${entry.path}`)
    );
  }

  violations.push(...collectManifestTopologyViolations(manifest, manifestFile, rootDir));

  return violations;
}

export function runManifestIntegrityCheck(options = {}) {
  const violations = collectManifestIntegrityViolations(options);
  return { violations };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runManifestIntegrityCheck();

  if (result.violations.length > 0) {
    printViolations('Manifest integrity violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write(`${PASS_MESSAGE}\n`);
}
