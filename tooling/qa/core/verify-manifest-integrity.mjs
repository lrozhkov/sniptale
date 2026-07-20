/**
 * Manifest integrity guardrail.
 * Ensures repo-owned manifest paths and web_accessible_resources resolve to real files.
 */

import fs from 'node:fs';
import path from 'node:path';

import { getOptionValue, isExecutedAsScript, printViolations, repoRoot } from './shared.mjs';
import {
  collectEffectRuntimeSandboxViolations,
  collectSandboxEntries,
} from './manifest-integrity-sandbox.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const OFFSCREEN_DOCUMENT_DTO_PATH =
  'apps/extension/src/background/media/video/runtime/offscreen-document-dto.ts';
const EXPECTED_ACTION_DEFAULT_TITLE = 'Open Sniptale';
const EXPECTED_EXTENSION_PAGES_CSP = "script-src 'self'; object-src 'self';";
const EXPECTED_OFFSCREEN_REASON = 'USER_MEDIA';
const MANROPE_FONT_RESOURCE_PATTERN = /^fonts\/manrope-[\w-]+\.woff2$/u;
const PASS_MESSAGE = 'Manifest integrity passed';
const STATIC_CONTENT_SCRIPTS_MESSAGE = [
  'Top-level manifest content_scripts are intentionally forbidden;',
  'current-tab activation uses dynamic injection,',
  'and site/all-sites grant mode may use persistent chrome.scripting registration.',
].join(' ');

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

function collectWebAccessibleResources(manifest) {
  const resources = [];

  for (const entry of manifest.web_accessible_resources ?? []) {
    for (const resource of entry.resources ?? []) {
      resources.push(resource);
    }
  }

  return resources;
}

function collectManifestEntries(manifest) {
  return [
    ...collectBackgroundEntries(manifest),
    ...collectContentScriptEntries(manifest),
    ...collectActionEntries(manifest),
    ...collectSandboxEntries(manifest),
    ...collectIconEntries(manifest),
    ...collectWebAccessibleResourceEntries(manifest),
  ];
}

function collectBackgroundEntries(manifest) {
  return manifest.background?.service_worker
    ? [{ path: manifest.background.service_worker, label: 'background.service_worker' }]
    : [];
}

function collectContentScriptEntries(manifest) {
  return (manifest.content_scripts ?? []).flatMap((scriptEntry, scriptIndex) => [
    ...(scriptEntry.js ?? []).map((path) => ({
      path,
      label: `content_scripts[${scriptIndex}].js`,
    })),
    ...(scriptEntry.css ?? []).map((path) => ({
      path,
      label: `content_scripts[${scriptIndex}].css`,
    })),
  ]);
}

function collectActionEntries(manifest) {
  return manifest.action?.default_popup
    ? [{ path: manifest.action.default_popup, label: 'action.default_popup' }]
    : [];
}

function collectIconEntries(manifest) {
  return Object.entries(manifest.icons ?? {}).map(([iconSize, path]) => ({
    path,
    label: `icons.${iconSize}`,
  }));
}

function collectWebAccessibleResourceEntries(manifest) {
  return collectWebAccessibleResources(manifest).map((path) => ({
    path,
    label: 'web_accessible_resources.resources',
  }));
}

function pathNeedsExistenceCheck(entryPath) {
  return !entryPath.includes('*');
}

function collectManifestTopologyViolations(manifest, manifestFile, rootDir) {
  return [
    ...collectStaticContentScriptViolations(manifest, manifestFile),
    ...collectFontWebAccessibleResourceViolations(manifest, manifestFile),
    ...collectActionTitleViolations(manifest, manifestFile),
    ...collectExtensionCspViolations(manifest, manifestFile),
    ...collectEffectRuntimeSandboxViolations(manifest, manifestFile, createViolation),
    ...collectOffscreenReasonViolations(rootDir, manifestFile),
  ];
}

function collectStaticContentScriptViolations(manifest, manifestFile) {
  if ((manifest.content_scripts ?? []).length === 0) {
    return [];
  }

  return [createViolation(manifestFile, STATIC_CONTENT_SCRIPTS_MESSAGE)];
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

  const offscreenDtoSource = fs.readFileSync(offscreenDtoPath, 'utf8');
  if (!offscreenDtoSource.includes(`OFFSCREEN_DOCUMENT_REASON = '${EXPECTED_OFFSCREEN_REASON}'`)) {
    return [
      createViolation(
        OFFSCREEN_DOCUMENT_DTO_PATH,
        `offscreen document reason must stay ${JSON.stringify(EXPECTED_OFFSCREEN_REASON)}.`
      ),
    ];
  }

  return [];
}

function collectFontWebAccessibleResourceViolations(manifest, manifestFile) {
  const violations = [];
  for (const [entryIndex, entry] of (manifest.web_accessible_resources ?? []).entries()) {
    const resources = Array.isArray(entry.resources) ? entry.resources : [];
    const hasManropeFont = resources.some(
      (resource) => typeof resource === 'string' && MANROPE_FONT_RESOURCE_PATTERN.test(resource)
    );
    if (hasManropeFont && entry.use_dynamic_url !== true) {
      violations.push(
        createViolation(
          manifestFile,
          `web_accessible_resources[${entryIndex}] Manrope font entries must set use_dynamic_url: true.`
        )
      );
    }
  }
  return violations;
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
  const mode = getOptionValue(process.argv, '--mode') ?? 'development';
  const result = runManifestIntegrityCheck({ mode });

  if (result.violations.length > 0) {
    printViolations('Manifest integrity violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write(`${PASS_MESSAGE}\n`);
}
