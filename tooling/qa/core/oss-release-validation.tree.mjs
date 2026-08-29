import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sha256 } from '../../release/oss-release-policy.mjs';
import { sameStringSet } from './oss-release-validation.policy.mjs';

export function validatePackages(root, policy, inventory) {
  const errors = [];
  const current = inventory.currentTree.workspacePackages;
  if (!sameStringSet(current, policy.workspacePackages)) {
    errors.push('workspace package inventory is incomplete or stale');
  }
  const lock = JSON.parse(readFileSync(path.resolve(root, 'package-lock.json'), 'utf8'));
  for (const packagePath of current) {
    const packageJson = JSON.parse(readFileSync(path.resolve(root, packagePath), 'utf8'));
    if (
      packageJson.license !== policy.project.license ||
      packageJson.author !== policy.project.author
    ) {
      errors.push(`workspace package license/author drift: ${packagePath}`);
    }
    const lockKey =
      packagePath === 'package.json' ? '' : packagePath.replace(/\/package\.json$/u, '');
    if (lock.packages?.[lockKey]?.license !== policy.project.license) {
      errors.push(`package-lock license drift: ${lockKey || '<root>'}`);
    }
  }
  const manropeDependency = lock.packages?.['node_modules/@fontsource-variable/manrope'];
  if (manropeDependency?.version !== '5.3.0' || manropeDependency?.license !== 'OFL-1.1') {
    errors.push('package-lock Manrope provenance drift');
  }
  return errors;
}

function validateBundledFontConsumers(root, artifacts, releaseConsumers) {
  const errors = [];
  const fileNames = artifacts.map((entry) => path.basename(entry.path)).sort();
  const manifest = JSON.parse(
    readFileSync(path.resolve(root, 'apps/extension/manifest.json'), 'utf8')
  );
  const manifestFonts = (manifest.web_accessible_resources ?? [])
    .flatMap((entry) => entry.resources ?? [])
    .filter((entry) => entry.startsWith('fonts/'))
    .map((entry) => entry.slice('fonts/'.length));
  if (!sameStringSet(fileNames, manifestFonts))
    errors.push('manifest bundled font population drift');
  const layout = JSON.parse(
    readFileSync(path.resolve(root, 'apps/extension/build/layout.data.json'), 'utf8')
  );
  const layoutText = JSON.stringify(layout);
  const styleConsumers = releaseConsumers
    .filter((entry) => entry.category === 'bundled-font' && entry.path.endsWith('.css'))
    .map((entry) => readFileSync(path.resolve(root, entry.path), 'utf8'));
  for (const fileName of fileNames) {
    if (
      !layoutText.includes(`fonts/${fileName}`) ||
      !styleConsumers.some((styles) => styles.includes(fileName))
    ) {
      errors.push(`bundled font consumer drift: ${fileName}`);
    }
  }
  return errors;
}

function validateBundledAssetSourceParity(root, asset) {
  const errors = [];
  for (const artifact of asset?.artifacts ?? []) {
    const expectedSourcePath = `node_modules/${asset.sourcePackage}/files/${path.basename(artifact.path)}`;
    if (artifact.sourcePath !== expectedSourcePath) {
      errors.push(`bundled font installed source mapping drift: ${artifact.path}`);
      continue;
    }
    try {
      if (sha256(readFileSync(path.resolve(root, artifact.sourcePath))) !== artifact.sha256) {
        errors.push(`bundled font installed source drift: ${artifact.sourcePath}`);
      }
    } catch {
      errors.push(`bundled font installed source is missing: ${artifact.sourcePath}`);
    }
  }
  return errors;
}

function validateManropeLicenseSource(root) {
  const errors = [];
  try {
    const installed = readFileSync(
      path.resolve(root, 'node_modules/@fontsource-variable/manrope/LICENSE')
    );
    const canonical = readFileSync(path.resolve(root, 'LICENSES/OFL-1.1.txt'));
    if (!installed.equals(canonical)) {
      errors.push('Manrope installed license differs from canonical OFL text');
    }
  } catch {
    errors.push('Manrope installed license source is missing');
  }
  return errors;
}

export function validateBundledAssets(root, policy, inventory) {
  const errors = [];
  const declared = policy.bundledAssets.flatMap((asset) => asset.artifacts);
  const current = inventory.currentTree.bundledFonts;
  if (
    !sameStringSet(
      current.map((entry) => entry.path),
      declared.map((entry) => entry.path)
    )
  ) {
    errors.push('bundled font inventory is incomplete or stale');
  }
  for (const entry of current) {
    const expected = declared.find((candidate) => candidate.path === entry.path);
    if (!expected || entry.sha256 !== expected.sha256) {
      errors.push(`bundled font digest drift: ${entry.path}`);
    }
  }
  const manrope = policy.bundledAssets.find((asset) => asset.id === 'manrope');
  if (
    manrope?.sourcePackage !== '@fontsource-variable/manrope' ||
    manrope?.version !== '5.3.0' ||
    manrope?.license !== 'OFL-1.1' ||
    manrope?.copyright !==
      'Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)'
  ) {
    errors.push('Manrope provenance metadata drift');
  }
  return [
    ...errors,
    ...policy.bundledAssets.flatMap((asset) => validateBundledAssetSourceParity(root, asset)),
    ...validateManropeLicenseSource(root),
    ...validateBundledFontConsumers(root, declared, inventory.currentTree.releaseConsumers),
  ];
}
