/**
 * Deterministic build gate.
 * Can block on repo-wide lint warnings before starting the Vite build.
 */

import {
  emitCommandResult,
  fromRelativePath,
  isExecutedAsScript,
  repoRoot,
  runRepoNodeEntry,
} from '../core/shared.mjs';
import { lintWithEslint } from '../core/verify-eslint.mjs';
import {
  collectExtensionArtifactSnapshot,
  collectExtensionBuildArtifactViolations,
  extensionArtifactSnapshotErrors,
} from './verify-extension-build-artifacts.mjs';

const EXTENSION_VITE_CONFIG = fromRelativePath('apps/extension/vite.config.ts');

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
  const rootBuild = await buildRunner({ cwd: rootDir, mode });
  if (failedResult(rootBuild)) return rootBuild;
  const rootSnapshot = collectExtensionArtifactSnapshot({ rootDir });

  const appBuild = await buildRunner({ cwd: fromRelativePath('apps/extension'), mode });
  if (failedResult(appBuild)) return appBuild;
  const appSnapshot = collectExtensionArtifactSnapshot({ rootDir });
  const errors = [
    ...extensionArtifactSnapshotErrors(rootSnapshot, appSnapshot),
    ...collectExtensionBuildArtifactViolations({ rootDir }).map(
      (violation) => `${violation.file}: ${violation.message}`
    ),
  ];
  return {
    status: errors.length === 0 ? 0 : 1,
    stdout: `${rootBuild.stdout ?? ''}${appBuild.stdout ?? ''}`,
    stderr: errors.length === 0 ? '' : `${errors.join('\n')}\n`,
  };
}

export async function runBuild({
  cwd,
  enforceLint = true,
  lintRunner = lintWithEslint,
  buildRunner = runViteBuild,
  mode,
} = {}) {
  if (enforceLint) {
    const eslintResult = await lintRunner({ files: ['.'], strict: true });
    if (eslintResult.failed) {
      return {
        status: 1,
        stdout: eslintResult.output,
        stderr: '',
      };
    }
  }

  const buildResult = await buildRunner({ cwd, mode });
  return promoteBlockingCssBuildWarnings(buildResult);
}

if (isExecutedAsScript(import.meta.url)) {
  const result = await runBuild();
  emitCommandResult(result, 'Build passed\n');
}
