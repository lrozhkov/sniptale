/**
 * Runtime topology guardrail.
 * Keeps runtime registry, manifest-owned runtime surfaces, and active docs in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript, printViolations, repoRoot } from '../../core/shared.mjs';
import {
  getManifestOwnedRuntimeTopology,
  getRuntimeTopology,
} from '../../core/runtime-topology.mjs';
import { collectContentRuntimeReferenceViolations } from './content-runtime-topology.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const RUNTIME_CONTEXTS_DOC_PATH = 'docs/architecture/runtime-contexts.md';
const ACTIVE_TOPOLOGY_FILES = [
  'AGENTS.md',
  'DESIGN.md',
  'docs/architecture/code-organization.md',
  'docs/architecture/runtime-contexts.md',
  'docs/tooling/code-quality.md',
  'docs/tooling/operator-handbook.md',
  '.dependency-cruiser.cjs',
  'tooling/qa/core/runtime-topology.data.json',
];
const RETIRED_RUNTIME_IDS = ['sidepanel'];
const STATIC_CONTENT_SCRIPTS_MESSAGE = [
  'Top-level manifest content_scripts are intentionally forbidden;',
  'current-tab activation uses dynamic injection,',
  'and site/all-sites grant mode may use persistent chrome.scripting registration.',
].join(' ');

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function toAbsolutePath(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}

function loadManifest(rootDir, manifestPath) {
  return JSON.parse(fs.readFileSync(toAbsolutePath(rootDir, manifestPath), 'utf8'));
}

function collectManifestPaths(manifest) {
  const paths = [];

  if (manifest.background?.service_worker) {
    paths.push(manifest.background.service_worker);
  }

  for (const contentScript of manifest.content_scripts ?? []) {
    paths.push(...(contentScript.js ?? []));
    paths.push(...(contentScript.css ?? []));
  }

  if (manifest.action?.default_popup) {
    paths.push(manifest.action.default_popup);
  }

  for (const resourceEntry of manifest.web_accessible_resources ?? []) {
    paths.push(...(resourceEntry.resources ?? []));
  }

  return paths.filter((value) => !value.includes('*'));
}

function collectManifestOwnedRuntimeIds(manifest, rootDir) {
  const manifestPaths = collectManifestPaths(manifest);
  const runtimeRoots = new Set();

  for (const manifestPath of manifestPaths) {
    const matchingRuntime = getRuntimeTopology(rootDir).find((runtime) =>
      manifestPath.startsWith(`${runtime.root}/`)
    );

    if (matchingRuntime) {
      runtimeRoots.add(matchingRuntime.root);
      continue;
    }

    const segments = manifestPath.split('/');
    if (
      segments.length >= 4 &&
      segments[0] === 'apps' &&
      segments[1] === 'extension' &&
      segments[2] === 'src'
    ) {
      runtimeRoots.add(segments.slice(0, 4).join('/'));
      continue;
    }
    if (segments.length >= 2 && segments[0] === 'src') {
      runtimeRoots.add(segments.slice(0, 2).join('/'));
    }
  }

  return runtimeRoots;
}

function collectRegistryManifestCoverageViolations(rootDir, manifestPath) {
  const manifest = loadManifest(rootDir, manifestPath);
  const manifestOwnedRuntimeRoots = collectManifestOwnedRuntimeIds(manifest, rootDir);
  const violations = collectStaticContentScriptViolations(manifest, manifestPath);

  for (const runtime of getManifestOwnedRuntimeTopology(rootDir)) {
    violations.push(...collectRuntimeEntrypointViolations(runtime, rootDir, manifestPath));
  }

  for (const runtimeRoot of manifestOwnedRuntimeRoots) {
    const registered = getRuntimeTopology(rootDir).some((runtime) => runtime.root === runtimeRoot);
    if (!registered) {
      violations.push(
        createViolation(
          'runtime-topology-unregistered-runtime',
          manifestPath,
          `Manifest runtime root "${runtimeRoot}" is not registered in runtime-topology.data.json.`
        )
      );
    }
  }

  return violations;
}

function collectRuntimeEntrypointViolations(runtime, rootDir, manifestPath) {
  const violations = [];
  if ((runtime.entrypointFiles ?? []).length === 0) {
    violations.push(
      createViolation(
        'runtime-topology-missing-entrypoint',
        manifestPath,
        `Runtime "${runtime.id}" is manifest-owned but has no registered entrypoint file.`
      )
    );
  }
  for (const entrypointFile of runtime.entrypointFiles ?? []) {
    if (!entrypointFile.startsWith(`${runtime.root}/`)) {
      violations.push(
        createViolation(
          'runtime-topology-entrypoint-root-mismatch',
          manifestPath,
          `Runtime "${runtime.id}" entrypoint "${entrypointFile}" is outside "${runtime.root}".`
        )
      );
    }
    const entrypointPath = toAbsolutePath(rootDir, entrypointFile);
    if (!fs.existsSync(entrypointPath) || !fs.statSync(entrypointPath).isFile()) {
      violations.push(
        createViolation(
          'runtime-topology-entrypoint-missing',
          'tooling/qa/core/runtime-topology.data.json',
          `Runtime "${runtime.id}" entrypoint "${entrypointFile}" is not a file.`
        )
      );
    }
  }
  return violations;
}

function collectStaticContentScriptViolations(manifest, manifestPath) {
  if ((manifest.content_scripts ?? []).length === 0) {
    return [];
  }

  return [
    createViolation(
      'runtime-topology-static-content-scripts',
      manifestPath,
      STATIC_CONTENT_SCRIPTS_MESSAGE
    ),
  ];
}

function collectDocsCoverageViolations(rootDir, docsPath) {
  const docsText = fs.readFileSync(toAbsolutePath(rootDir, docsPath), 'utf8');

  return getRuntimeTopology(rootDir)
    .filter((runtime) => !runtime.docsMarkers.some((marker) => docsText.includes(marker)))
    .map((runtime) =>
      createViolation(
        'runtime-topology-docs-drift',
        docsPath,
        `Runtime "${runtime.id}" is missing from ${docsPath}.`
      )
    );
}

function collectRetiredRuntimeViolations(rootDir, retiredRuntimeIds = RETIRED_RUNTIME_IDS) {
  const violations = [];

  for (const relativePath of ACTIVE_TOPOLOGY_FILES) {
    const absolutePath = toAbsolutePath(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    for (const runtimeId of retiredRuntimeIds) {
      if (text.includes(runtimeId)) {
        violations.push(
          createViolation(
            'runtime-topology-retired-runtime',
            relativePath,
            `Retired runtime "${runtimeId}" still appears in active topology/config.`
          )
        );
      }
    }
  }

  return violations;
}

export function collectRuntimeTopologyViolations({
  rootDir = repoRoot,
  manifestPath = MANIFEST_PATH,
  docsPath = RUNTIME_CONTEXTS_DOC_PATH,
  retiredRuntimeIds = RETIRED_RUNTIME_IDS,
} = {}) {
  return [
    ...collectRegistryManifestCoverageViolations(rootDir, manifestPath),
    ...collectContentRuntimeReferenceViolations(rootDir),
    ...collectDocsCoverageViolations(rootDir, docsPath),
    ...collectRetiredRuntimeViolations(rootDir, retiredRuntimeIds),
  ];
}

export function runRuntimeTopologyCheck(options = {}) {
  return {
    violations: collectRuntimeTopologyViolations(options),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runRuntimeTopologyCheck();

  if (result.violations.length > 0) {
    printViolations('Runtime topology violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Runtime topology passed\n');
}
