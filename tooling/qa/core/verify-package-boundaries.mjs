import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import {
  contractLifecycleGlobalErrors,
  packageTypescriptConfigErrors,
} from './verify-package-boundaries.contracts.mjs';

const PACKAGE_ROOTS = {
  '@sniptale/foundation': 'packages/foundation',
  '@sniptale/runtime-contracts': 'packages/runtime-contracts',
  '@sniptale/platform': 'packages/platform',
  '@sniptale/ui': 'packages/ui',
};
const ALLOWED_PACKAGE_EDGES = {
  '@sniptale/foundation': [],
  '@sniptale/runtime-contracts': ['@sniptale/foundation'],
  '@sniptale/platform': ['@sniptale/foundation', '@sniptale/runtime-contracts'],
  '@sniptale/ui': ['@sniptale/foundation', '@sniptale/runtime-contracts', '@sniptale/platform'],
};
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|css)$/u;
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bvi\.(?:doMock|mock)\s*\(|^\s*import\s*)["'`]([^"'`]+)["'`]/gmu;

function filesBelow(root, relativeRoot) {
  const absoluteRoot = resolve(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(posix.relative(root, path));
    }
  };
  visit(absoluteRoot);
  return files.sort();
}

function readJson(root, path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  } catch {
    return null;
  }
}

function workspaceSpecifier(specifier) {
  return Object.keys(PACKAGE_ROOTS).find(
    (name) => specifier === name || specifier.startsWith(`${name}/`)
  );
}

function exportKey(packageName, specifier) {
  const bare = specifier.split(/[?#]/u, 1)[0];
  return bare === packageName ? '.' : `.${bare.slice(packageName.length)}`;
}

function relativeTarget(file, specifier) {
  const bare = specifier.split(/[?#]/u, 1)[0];
  return posix.normalize(posix.join(posix.dirname(file), bare));
}

function manifestErrors(root, packageName, packageRoot, manifest) {
  if (manifest?.name !== packageName || manifest?.private !== true || !manifest.exports) {
    return [`invalid package manifest: ${packageRoot}/package.json`];
  }
  const errors = [];
  for (const [key, target] of Object.entries(manifest.exports)) {
    if (typeof target !== 'string' || !existsSync(resolve(root, packageRoot, target))) {
      errors.push(`missing package export target: ${packageName}${key.slice(1)}`);
    }
  }
  return errors;
}

function importErrors(root, file, packageName, packageRoot, manifests) {
  const errors = [];
  const contents = readFileSync(resolve(root, file), 'utf8');
  for (const match of contents.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];
    if (packageName && /(?:^|\/)apps\/extension(?:\/|$)/u.test(specifier)) {
      errors.push(`package imports app owner: ${file}`);
      continue;
    }
    const dependency = workspaceSpecifier(specifier);
    if (dependency) {
      const key = exportKey(dependency, specifier);
      if (!Object.hasOwn(manifests.get(dependency)?.exports ?? {}, key)) {
        errors.push(`package deep import is not exported: ${file} -> ${specifier}`);
      }
      if (packageName && dependency !== packageName) {
        if (!ALLOWED_PACKAGE_EDGES[packageName].includes(dependency)) {
          errors.push(`forbidden package dependency: ${packageName} -> ${dependency}`);
        }
        if (!Object.hasOwn(manifests.get(packageName)?.dependencies ?? {}, dependency)) {
          errors.push(`undeclared workspace dependency: ${file} -> ${dependency}`);
        }
      }
      continue;
    }
    if (!packageName || !specifier.startsWith('.')) continue;
    const target = relativeTarget(file, specifier);
    if (!target.startsWith(`${packageRoot}/`)) {
      errors.push(`package relative import escapes owner: ${file} -> ${specifier}`);
    }
  }
  if (!packageName) {
    for (const match of contents.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1];
      if (specifier.startsWith('.') && relativeTarget(file, specifier).startsWith('packages/')) {
        errors.push(`app bypasses package exports: ${file} -> ${specifier}`);
      }
    }
  }
  errors.push(...contractLifecycleGlobalErrors(file, packageName, contents));
  return errors;
}

export function packageBoundaryErrors(root = process.cwd()) {
  const errors = [];
  if (existsSync(resolve(root, 'src/shared')))
    errors.push('retired shared root remains: src/shared');
  if (existsSync(resolve(root, 'packages/legacy-shared'))) {
    errors.push('forbidden compatibility package remains: packages/legacy-shared');
  }
  const manifests = new Map();
  for (const [packageName, packageRoot] of Object.entries(PACKAGE_ROOTS)) {
    const manifest = readJson(root, `${packageRoot}/package.json`);
    manifests.set(packageName, manifest);
    errors.push(...manifestErrors(root, packageName, packageRoot, manifest));
    errors.push(...packageTypescriptConfigErrors(root, packageName, packageRoot));
  }
  const sourceRoots = [
    'apps/extension/src',
    ...Object.values(PACKAGE_ROOTS).map((rootPath) => `${rootPath}/src`),
  ];
  for (const sourceRoot of sourceRoots) {
    for (const file of filesBelow(root, sourceRoot).filter((path) => SOURCE_FILE.test(path))) {
      const packageName = Object.entries(PACKAGE_ROOTS).find(([, packageRoot]) =>
        file.startsWith(`${packageRoot}/src/`)
      )?.[0];
      errors.push(
        ...importErrors(
          root,
          file,
          packageName,
          packageName ? PACKAGE_ROOTS[packageName] : null,
          manifests
        )
      );
    }
  }
  return [...new Set(errors)].sort();
}

export function runPackageBoundaryCheck(options = {}) {
  const root = typeof options === 'string' ? options : (options.root ?? process.cwd());
  return { violations: packageBoundaryErrors(root) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = packageBoundaryErrors();
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Package boundaries: OK\n');
  }
}
