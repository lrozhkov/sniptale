import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_LICENSE_DIGESTS,
  INTERFACE_FONT_PATH,
  INTERFACE_FONT_LICENSE_PATH,
  sha256,
} from '../../../../release/policy/oss-release-policy.mjs';
import { sameStringSet } from './policy.mjs';

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
  return errors;
}

function validateBundledFontConsumers(root, artifacts, releaseConsumers) {
  const errors = [];
  const fileNames = artifacts.map((entry) => path.basename(entry.path)).sort();
  const publicFileNames = artifacts
    .filter((entry) => entry.path.startsWith('apps/extension/public/fonts/'))
    .map((entry) => path.basename(entry.path));
  const manifest = JSON.parse(
    readFileSync(path.resolve(root, 'apps/extension/manifest.json'), 'utf8')
  );
  const manifestFonts = (manifest.web_accessible_resources ?? [])
    .flatMap((entry) => entry.resources ?? [])
    .filter((entry) => entry.startsWith('fonts/'))
    .map((entry) => entry.slice('fonts/'.length));
  if (!sameStringSet(publicFileNames, manifestFonts))
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
      !layoutText.includes(
        `${fileName === 'golos-ui-vf.woff2' ? 'assets' : 'fonts'}/${fileName}`
      ) ||
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
    const expectedSourcePath =
      asset.id === 'golos-ui'
        ? INTERFACE_FONT_PATH
        : `node_modules/${asset.sourcePackage}/files/${path.basename(artifact.path)}`;
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

function validateInterfaceFontSource(root, asset) {
  const errors = [];
  if (
    asset?.sourcePackage !== '@sniptale/ui' ||
    asset?.version !== '2.000' ||
    asset?.license !== 'OFL-1.1' ||
    asset?.licensePath !== INTERFACE_FONT_LICENSE_PATH ||
    asset?.copyright !==
      'Copyright (c) 2018, Paratype Inc (https://paratype.com), Copyright (c) 2018, Paratype Ltd, with Reserved Font Name "Golos UI".' ||
    asset?.artifacts?.length !== 1 ||
    asset.artifacts[0].path !== INTERFACE_FONT_PATH
  )
    errors.push('Golos UI provenance metadata drift');
  try {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(root, 'packages/ui/package.json'), 'utf8')
    );
    if (
      packageJson.exports?.['./styles/interface-font'] !==
        './src/styles/golos-ui/golos-ui-vf.woff2' ||
      packageJson.exports?.['./styles/interface-font-license'] !==
        './src/styles/golos-ui/LICENSE.txt'
    )
      errors.push('Golos UI canonical asset export drift');
  } catch {
    errors.push('Golos UI canonical asset exports are missing');
  }
  try {
    const license = readFileSync(path.resolve(root, INTERFACE_FONT_LICENSE_PATH));
    if (sha256(license) !== CANONICAL_LICENSE_DIGESTS.get(INTERFACE_FONT_LICENSE_PATH)) {
      errors.push('Golos UI license digest drift');
    }
  } catch {
    errors.push('Golos UI license source is missing');
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
  return [
    ...errors,
    ...policy.bundledAssets.flatMap((asset) => validateBundledAssetSourceParity(root, asset)),
    ...validateInterfaceFontSource(
      root,
      policy.bundledAssets.find((asset) => asset.id === 'golos-ui')
    ),
    ...validateBundledFontConsumers(root, declared, inventory.currentTree.releaseConsumers),
  ];
}
