/**
 * Runtime topology guardrail.
 * Keeps runtime registry, manifest-owned runtime surfaces, and active docs in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadAgentToolingArchive } from '../../../../agent-tooling/agent-tooling.mjs';
import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';
import { getValidatedRuntimeTopology } from './model.mjs';
import { collectContentRuntimeReferenceViolations } from './content-runtime.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const BUILD_LAYOUT_PATH = 'apps/extension/build/layout.data.json';
const DYNAMIC_CONTENT_RUNTIME_ROOT = 'apps/extension/src/content';
const TOPOLOGY_PATH = 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json';
const ACTIVE_TOPOLOGY_FILES = [
  'docs/architecture/code-organization.md',
  'docs/architecture/runtime-contexts.md',
  'docs/tooling/code-quality.md',
  'docs/tooling/operator-handbook.md',
  '.dependency-cruiser.cjs',
  'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
];
const AGENT_TOOLING_ARCHIVE = 'docs/agent-tooling/agent-tooling.zip';
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

  paths.push(...(manifest.sandbox?.pages ?? []));

  return paths.filter((value) => !value.includes('*'));
}

function collectManifestOwnedRuntimeIds(manifest, topology) {
  const manifestPaths = collectManifestPaths(manifest);
  const runtimeRoots = new Set();

  for (const manifestPath of manifestPaths) {
    const matchingRuntime = topology.find((runtime) => manifestPath.startsWith(`${runtime.root}/`));

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

function collectRegistryManifestCoverageViolations(rootDir, manifestPath, topology) {
  const manifest = loadManifest(rootDir, manifestPath);
  const manifestOwnedRuntimeRoots = collectManifestOwnedRuntimeIds(manifest, topology);
  const violations = collectStaticContentScriptViolations(manifest, manifestPath);

  for (const runtime of topology) {
    violations.push(...collectRuntimeEntrypointViolations(runtime, rootDir, manifestPath));
  }

  for (const runtimeRoot of manifestOwnedRuntimeRoots) {
    const registered = topology.some((runtime) => runtime.root === runtimeRoot);
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
  for (const entrypointFile of runtime.entrypointFiles) {
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
          TOPOLOGY_PATH,
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

function loadBuildRuntimeInputs(rootDir, buildLayoutPath) {
  const layout = JSON.parse(fs.readFileSync(toAbsolutePath(rootDir, buildLayoutPath), 'utf8'));
  if (
    !layout ||
    typeof layout !== 'object' ||
    !Array.isArray(layout.htmlInputs) ||
    !Array.isArray(layout.manifestModuleInputs)
  ) {
    throw new Error('Build layout must declare htmlInputs and manifestModuleInputs arrays.');
  }

  const htmlInputs = layout.htmlInputs
    .filter((input) => input?.sourcePath?.startsWith('apps/extension/src/'))
    .map((input, index) => {
      if (
        typeof input.outputPath !== 'string' ||
        typeof input.sourcePath !== 'string' ||
        typeof input.mode !== 'string'
      ) {
        throw new Error(`Build layout htmlInputs row ${index} has an invalid runtime projection.`);
      }
      return {
        mode: input.mode,
        outputPath: input.outputPath,
        sourcePath: input.sourcePath,
      };
    });
  const manifestModuleInputs = layout.manifestModuleInputs.map((input, index) => {
    if (typeof input?.sourcePath !== 'string' || typeof input?.virtualPath !== 'string') {
      throw new Error(
        `Build layout manifestModuleInputs row ${index} has an invalid runtime projection.`
      );
    }
    return {
      mode: 'manifest-module',
      outputPath: input.virtualPath,
      sourcePath: input.sourcePath,
    };
  });
  return [...htmlInputs, ...manifestModuleInputs];
}

function runtimeForPath(topology, runtimePath) {
  return topology.find(
    (runtime) => runtimePath === runtime.root || runtimePath.startsWith(`${runtime.root}/`)
  );
}

function collectRegistryBuildCoverageViolations(rootDir, buildLayoutPath, topology) {
  let buildInputs;
  try {
    buildInputs = loadBuildRuntimeInputs(rootDir, buildLayoutPath);
  } catch (error) {
    return [
      createViolation(
        'runtime-topology-build-layout-invalid',
        buildLayoutPath,
        error instanceof Error ? error.message : String(error)
      ),
    ];
  }

  const violations = [];
  const buildRuntimeIds = new Set();
  for (const input of buildInputs) {
    const sourceRuntime = runtimeForPath(topology, input.sourcePath);
    const outputRuntime = runtimeForPath(topology, input.outputPath);
    if (!sourceRuntime || !outputRuntime || sourceRuntime.id !== outputRuntime.id) {
      violations.push(
        createViolation(
          'runtime-topology-unregistered-build-runtime',
          buildLayoutPath,
          `Build ${input.mode} input "${input.sourcePath}" → "${input.outputPath}" ` +
            'is not owned by one registered runtime.'
        )
      );
      continue;
    }
    buildRuntimeIds.add(sourceRuntime.id);
    if (!sourceRuntime.entrypointFiles.includes(input.sourcePath)) {
      violations.push(
        createViolation(
          'runtime-topology-build-entrypoint-missing',
          buildLayoutPath,
          `Runtime "${sourceRuntime.id}" does not register build ${input.mode} input ` +
            `"${input.sourcePath}" as an entrypoint.`
        )
      );
    }
  }

  const buildSourcePaths = new Set(buildInputs.map((input) => input.sourcePath));
  for (const runtime of topology) {
    for (const entrypointFile of runtime.entrypointFiles.filter((file) => file.endsWith('.html'))) {
      if (!buildSourcePaths.has(entrypointFile)) {
        violations.push(
          createViolation(
            'runtime-topology-unowned-build-entrypoint',
            TOPOLOGY_PATH,
            `Runtime "${runtime.id}" HTML entrypoint "${entrypointFile}" is absent from the build layout.`
          )
        );
      }
    }
    if (!buildRuntimeIds.has(runtime.id) && runtime.root !== DYNAMIC_CONTENT_RUNTIME_ROOT) {
      violations.push(
        createViolation(
          'runtime-topology-runtime-without-build-authority',
          TOPOLOGY_PATH,
          `Runtime "${runtime.id}" root "${runtime.root}" is absent from manifest-module and HTML build inputs.`
        )
      );
    }
  }
  return violations;
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

  const archivePath = toAbsolutePath(rootDir, AGENT_TOOLING_ARCHIVE);
  if (fs.existsSync(archivePath)) {
    try {
      const archivedFiles = loadAgentToolingArchive(archivePath);
      for (const relativePath of ['AGENTS.md', 'DESIGN.md']) {
        const text = archivedFiles.get(relativePath).contents.toString('utf8');
        for (const runtimeId of retiredRuntimeIds) {
          if (text.includes(runtimeId)) {
            violations.push(
              createViolation(
                'runtime-topology-retired-runtime',
                AGENT_TOOLING_ARCHIVE,
                `Retired runtime "${runtimeId}" still appears in archived ${relativePath}.`
              )
            );
          }
        }
      }
    } catch (error) {
      violations.push(
        createViolation(
          'runtime-topology-agent-tooling-archive-invalid',
          AGENT_TOOLING_ARCHIVE,
          error instanceof Error ? error.message : String(error)
        )
      );
    }
  }

  return violations;
}

export function collectRuntimeTopologyViolations({
  rootDir = repoRoot,
  manifestPath = MANIFEST_PATH,
  buildLayoutPath = BUILD_LAYOUT_PATH,
  retiredRuntimeIds = RETIRED_RUNTIME_IDS,
} = {}) {
  let topology;
  try {
    topology = getValidatedRuntimeTopology(rootDir);
  } catch (error) {
    return [
      createViolation(
        'runtime-topology-registry-invalid',
        TOPOLOGY_PATH,
        error instanceof Error ? error.message : String(error)
      ),
      ...collectContentRuntimeReferenceViolations(rootDir),
      ...collectRetiredRuntimeViolations(rootDir, retiredRuntimeIds),
    ];
  }

  return [
    ...collectRegistryManifestCoverageViolations(rootDir, manifestPath, topology),
    ...collectRegistryBuildCoverageViolations(rootDir, buildLayoutPath, topology),
    ...collectContentRuntimeReferenceViolations(rootDir),
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
