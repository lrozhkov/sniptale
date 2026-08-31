/**
 * Deterministic build gate.
 * Builds the extension after canonical lint/typecheck owners have run.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath, repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { emitCommandResult, isExecutedAsScript } from '../../runtime/process/shared-cli.mjs';
import { runRepoNodeEntry } from '../../runtime/process/shared-process.mjs';

const EXTENSION_VITE_CONFIG = fromRelativePath('apps/extension/vite.config.ts');
const EXTENSION_LAYOUT_POLICY = 'apps/extension/build/layout.data.json';

function digest(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function collectFiles(root, directory = '') {
  const absoluteDirectory = path.join(root, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? collectFiles(root, relativePath) : [relativePath];
  });
}

function collectArtifactSnapshot(rootDir, outputRoot) {
  const distRoot = path.join(rootDir, outputRoot);
  return collectFiles(distRoot)
    .sort()
    .map((relativePath) => ({
      digest: digest(fs.readFileSync(path.join(distRoot, relativePath))),
      path: relativePath,
    }));
}

function artifactSnapshotErrors(left, right) {
  const leftByPath = new Map(left.map((entry) => [entry.path, entry.digest]));
  const rightByPath = new Map(right.map((entry) => [entry.path, entry.digest]));
  return [
    ...[...leftByPath.keys()]
      .filter((file) => !rightByPath.has(file))
      .map((file) => `app build is missing root artifact: ${file}`),
    ...[...rightByPath.keys()]
      .filter((file) => !leftByPath.has(file))
      .map((file) => `app build has extra artifact: ${file}`),
    ...[...leftByPath]
      .filter(([file, artifactDigest]) => rightByPath.get(file) !== artifactDigest)
      .map(([file]) => `root/app artifact content differs: ${file}`),
  ].sort();
}

function collectRequiredArtifactErrors(rootDir, policy) {
  const distRoot = path.join(rootDir, policy.outputRoot);
  const artifactFiles = new Set(collectFiles(distRoot));
  const errors = policy.requiredReleaseArtifacts
    .filter((file) => !artifactFiles.has(file))
    .map((file) => `${policy.outputRoot}: required artifact is missing: ${file}`);

  if (fs.existsSync(path.join(rootDir, policy.forbiddenOutputRoot))) {
    errors.push(`${policy.forbiddenOutputRoot}: app-local build output must not be created`);
  }

  const builtManifestPath = path.join(distRoot, 'manifest.json');
  const sourceManifestPath = path.join(rootDir, policy.manifestPath);
  if (fs.existsSync(builtManifestPath) && fs.existsSync(sourceManifestPath)) {
    const built = JSON.parse(fs.readFileSync(builtManifestPath, 'utf8'));
    const source = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
    if (built.action?.default_popup !== source.action?.default_popup) {
      errors.push('dist/manifest.json: built popup path differs from the source contract');
    }
    if (JSON.stringify(built.sandbox?.pages) !== JSON.stringify(source.sandbox?.pages)) {
      errors.push('dist/manifest.json: built sandbox paths differ from the source contract');
    }
  }
  return errors;
}

function hasBlockingCssSyntaxWarnings(output) {
  return output.includes('[esbuild css minify]') && output.includes('[css-syntax-error]');
}

function appendOutputMessage(output, message) {
  if (!output) {
    return `${message}\n`;
  }

  return output.endsWith('\n') ? `${output}${message}\n` : `${output}\n${message}\n`;
}

function promoteBlockingCssBuildWarnings(result) {
  const exitCode = result.status ?? result.exitCode ?? 0;
  if (exitCode !== 0) {
    return result;
  }

  const combinedOutput = `${result.stdout ?? result.output ?? ''}\n${result.stderr ?? ''}`;
  if (!hasBlockingCssSyntaxWarnings(combinedOutput)) {
    return result;
  }

  return {
    ...result,
    status: 1,
    stderr: appendOutputMessage(
      result.stderr ?? '',
      'Blocking CSS syntax/minify warnings detected in build output.'
    ),
  };
}

export function runViteBuild({ cwd, mode } = {}) {
  const args = ['build', '--config', EXTENSION_VITE_CONFIG, ...(mode ? ['--mode', mode] : [])];
  return runRepoNodeEntry('node_modules/vite/bin/vite.js', args, {
    cwd,
    stdio: 'pipe',
  });
}

function failedResult(result) {
  return (result.status ?? result.exitCode ?? 0) !== 0;
}

export async function runExtensionBuildEquivalence({
  buildRunner = runViteBuild,
  rootDir = repoRoot,
  mode = 'release',
} = {}) {
  const policy = JSON.parse(fs.readFileSync(path.join(rootDir, EXTENSION_LAYOUT_POLICY), 'utf8'));
  const rootBuild = await buildRunner({ cwd: rootDir, mode });
  if (failedResult(rootBuild)) return rootBuild;
  const rootSnapshot = collectArtifactSnapshot(rootDir, policy.outputRoot);

  const appBuild = await buildRunner({ cwd: fromRelativePath('apps/extension'), mode });
  if (failedResult(appBuild)) return appBuild;
  const appSnapshot = collectArtifactSnapshot(rootDir, policy.outputRoot);
  const errors = [
    ...artifactSnapshotErrors(rootSnapshot, appSnapshot),
    ...collectRequiredArtifactErrors(rootDir, policy),
  ];
  return {
    status: errors.length === 0 ? 0 : 1,
    stdout: `${rootBuild.stdout ?? ''}${appBuild.stdout ?? ''}`,
    stderr: errors.length === 0 ? '' : `${errors.join('\n')}\n`,
  };
}

export async function runBuild({ cwd, buildRunner = runViteBuild, mode } = {}) {
  const buildResult = await buildRunner({ cwd, mode });
  return promoteBlockingCssBuildWarnings(buildResult);
}

if (isExecutedAsScript(import.meta.url)) {
  const result = await runBuild();
  emitCommandResult(result, 'Build passed\n');
}
