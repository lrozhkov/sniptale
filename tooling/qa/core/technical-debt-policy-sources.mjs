import fs from 'node:fs';
import path from 'node:path';

import { collectRecursiveFiles } from './recursive-files.mjs';

export const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;
export const POLICY_SOURCE_PATTERN = /\.(?:[cm]?[jt]sx?|json|ya?ml|toml)$/u;

const IGNORED_SEGMENTS = new Set(['.git', '.tmp', 'coverage', 'dist', 'node_modules']);
const EXECUTABLE_CONFIG_PATTERN =
  /^(?:\.[^.]+(?:rc|-cruiser)|[a-z0-9][\w.-]*\.config)\.(?:[cm]?[jt]s)$/u;

export const POLICY_DISCOVERY_SOURCE_MANIFEST = Object.freeze({
  recursiveRoots: Object.freeze(['tooling']),
  exactFiles: Object.freeze([
    '.dependency-cruiser.cjs',
    'apps/extension/postcss.config.js',
    'apps/extension/tailwind.config.js',
    'apps/extension/vite.config.ts',
    'eslint.config.js',
    'playwright.config.ts',
    'vitest.config.ts',
  ]),
  guardedConfigDirectories: Object.freeze(['.', 'apps/extension']),
});

export function sortPolicyStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertManifestShape(manifest) {
  for (const field of ['recursiveRoots', 'exactFiles', 'guardedConfigDirectories']) {
    if (
      !Array.isArray(manifest[field]) ||
      manifest[field].some((value) => typeof value !== 'string')
    ) {
      throw new TypeError(`Policy discovery source manifest requires a string array for ${field}.`);
    }
    if (new Set(manifest[field]).size !== manifest[field].length) {
      throw new Error(`Policy discovery source manifest has duplicate ${field} entries.`);
    }
  }
}

function normalizeManifest(manifest) {
  return {
    recursiveRoots: sortPolicyStrings(new Set(manifest.recursiveRoots)),
    exactFiles: sortPolicyStrings(new Set(manifest.exactFiles)),
    guardedConfigDirectories: sortPolicyStrings(new Set(manifest.guardedConfigDirectories)),
  };
}

function guardedExecutableConfigs(root, manifest) {
  return sortPolicyStrings(
    new Set(
      manifest.guardedConfigDirectories.flatMap((relativeDirectory) => {
        const absoluteDirectory = path.join(root, relativeDirectory);
        if (!fs.existsSync(absoluteDirectory)) {
          throw new Error(
            `Policy discovery guarded config directory is missing: ${relativeDirectory}.`
          );
        }
        return fs
          .readdirSync(absoluteDirectory, { withFileTypes: true })
          .filter((entry) => EXECUTABLE_CONFIG_PATTERN.test(entry.name))
          .map((entry) =>
            relativeDirectory === '.' ? entry.name : path.posix.join(relativeDirectory, entry.name)
          );
      })
    )
  );
}

export function preparePolicySourceManifest(root, sourceManifest) {
  assertManifestShape(sourceManifest);
  const manifest = normalizeManifest(sourceManifest);
  const declaredFiles = new Set(manifest.exactFiles);
  const unlisted = guardedExecutableConfigs(root, manifest).filter(
    (file) => !declaredFiles.has(file)
  );
  if (unlisted.length > 0) {
    throw new Error(
      `Active executable QA/config sources are absent from the policy discovery manifest: ${unlisted.join(', ')}.`
    );
  }
  return manifest;
}

export function collectPolicyManifestFiles(root, manifest, predicate) {
  const recursiveFiles = manifest.recursiveRoots.flatMap((relativeRoot) => {
    const absoluteRoot = path.join(root, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) {
      throw new Error(`Policy discovery source root is missing: ${relativeRoot}.`);
    }
    return collectRecursiveFiles(absoluteRoot, {
      baseDir: root,
      ignoredSegments: IGNORED_SEGMENTS,
      predicate,
    });
  });
  const exactFiles = manifest.exactFiles.filter(predicate);
  for (const relativePath of manifest.exactFiles) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Policy discovery exact source is missing: ${relativePath}.`);
    }
    const stats = fs.lstatSync(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Policy discovery exact source must be a regular file: ${relativePath}.`);
    }
  }
  return sortPolicyStrings(new Set([...recursiveFiles, ...exactFiles]));
}
