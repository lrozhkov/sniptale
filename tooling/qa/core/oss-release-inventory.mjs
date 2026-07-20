import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { readOssReleasePolicy, sha256 } from '../../release/oss-release-policy.mjs';
import { discoverOssReleaseConsumers } from './oss-release-consumer-discovery.mjs';

function normalize(relativePath) {
  return relativePath.replaceAll(path.sep, '/');
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function workspacePackagePathsFromTree(packageJson, treePaths) {
  const packages = ['package.json'];
  for (const workspace of packageJson.workspaces ?? []) {
    if (workspace.endsWith('/*')) {
      const prefix = `${workspace.slice(0, -1)}`;
      packages.push(
        ...treePaths.filter((entry) => {
          if (!entry.startsWith(prefix) || !entry.endsWith('/package.json')) return false;
          const workspaceName = entry.slice(prefix.length, -'/package.json'.length);
          return workspaceName.length > 0 && !workspaceName.includes('/');
        })
      );
      continue;
    }
    const packagePath = `${workspace}/package.json`;
    if (treePaths.includes(packagePath)) packages.push(packagePath);
  }
  return [...new Set(packages)].sort();
}

function collectCurrentTreePaths(root, relativeDirectory = '') {
  const directory = path.resolve(root, relativeDirectory || '.');
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = normalize(path.join(relativeDirectory, entry.name));
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.tmp') return [];
    return entry.isDirectory() ? collectCurrentTreePaths(root, relativePath) : [relativePath];
  });
}

function hashEntries(root, paths) {
  return paths.map((relativePath) => {
    const absolutePath = path.resolve(root, relativePath);
    return {
      path: relativePath,
      sha256: existsSync(absolutePath) ? sha256(readFileSync(absolutePath)) : null,
    };
  });
}

function collectCurrentReleaseInventory(root, policy) {
  const treePaths = collectCurrentTreePaths(root);
  const rootPackage = readJson(root, 'package.json');
  const fontPaths = treePaths
    .filter((entry) => entry.startsWith('apps/extension/public/fonts/'))
    .sort();
  return {
    bundledFonts: hashEntries(root, fontPaths),
    contributorFiles: hashEntries(root, [...policy.contributorFiles].sort()),
    legalFiles: hashEntries(root, policy.legalFiles.map((entry) => entry.source).sort()),
    releaseConsumers: discoverOssReleaseConsumers(root),
    releaseDocs: hashEntries(root, [...policy.releaseDocs].sort()),
    workspacePackages: workspacePackagePathsFromTree(rootPackage, treePaths),
  };
}

export function createOssReleaseInventory(
  root = process.cwd(),
  policy = readOssReleasePolicy(root)
) {
  return {
    schemaVersion: 2,
    currentTree: collectCurrentReleaseInventory(root, policy),
  };
}
