import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import {
  CODE_EXTENSIONS,
  collectModuleImportGraph,
} from '../../../analysis/dependency-graph/module-import-graph.mjs';
import { contractLifecycleGlobalErrors, packageTypescriptConfigErrors } from './contracts.mjs';

const PACKAGE_ROOTS = {
  '@sniptale/foundation': 'packages/foundation',
  '@sniptale/runtime-contracts': 'packages/runtime-contracts',
  '@sniptale/platform': 'packages/platform',
  '@sniptale/ui': 'packages/ui',
};
const SOURCE_EXTENSIONS = [...CODE_EXTENSIONS, '.css'];

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

function manifestErrors(root, packageName, packageRoot, manifest) {
  if (manifest?.name !== packageName || manifest?.private !== true || !manifest.exports) {
    return [`invalid package manifest: ${packageRoot}/package.json`];
  }
  const errors = [];
  for (const [key, target] of Object.entries(manifest.exports)) {
    const normalizedTarget =
      typeof target === 'string' && target.startsWith('./') && !target.includes('\\')
        ? posix.normalize(posix.join(packageRoot, target))
        : null;
    if (!normalizedTarget || !normalizedTarget.startsWith(`${packageRoot}/`)) {
      errors.push(`package export target escapes owner: ${packageName}${key.slice(1)}`);
    } else if (!existsSync(resolve(root, normalizedTarget))) {
      errors.push(`missing package export target: ${packageName}${key.slice(1)}`);
    }
  }
  return errors;
}

function sourcePackageName(file) {
  return Object.entries(PACKAGE_ROOTS).find(([, packageRoot]) =>
    file.startsWith(`${packageRoot}/src/`)
  )?.[0];
}

function importGraphErrors(root, files, manifests) {
  const errors = [];
  const graph = collectModuleImportGraph({
    files,
    root,
    readFile: (file) => readFileSync(resolve(root, file), 'utf8'),
  });
  const edges = [...graph.codeEdges, ...graph.resourceEdges];
  for (const { importer, specifier, target } of edges) {
    const packageName = sourcePackageName(importer);
    const packageRoot = packageName ? PACKAGE_ROOTS[packageName] : null;
    if (packageRoot && specifier.startsWith('.') && !target.startsWith(`${packageRoot}/`)) {
      errors.push(`package relative import escapes owner: ${importer} -> ${specifier}`);
    }
    if (
      !packageName &&
      importer.startsWith('apps/extension/src/') &&
      specifier.startsWith('.') &&
      target.startsWith('packages/')
    ) {
      errors.push(`app bypasses package exports: ${importer} -> ${specifier}`);
    }
    const dependency = workspaceSpecifier(specifier);
    if (
      packageName &&
      dependency &&
      dependency !== packageName &&
      !Object.hasOwn(manifests.get(packageName)?.dependencies ?? {}, dependency)
    ) {
      errors.push(`undeclared workspace dependency: ${importer} -> ${dependency}`);
    }
  }
  for (const { importer, specifier } of graph.unresolvedEdges) {
    const dependency = workspaceSpecifier(specifier);
    if (!dependency) continue;
    const key = exportKey(dependency, specifier);
    if (!Object.hasOwn(manifests.get(dependency)?.exports ?? {}, key)) {
      errors.push(`package deep import is not exported: ${importer} -> ${specifier}`);
    }
  }
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
  const sourceFiles = sourceRoots.flatMap((sourceRoot) =>
    filesBelow(root, sourceRoot).filter((path) =>
      SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))
    )
  );
  errors.push(...importGraphErrors(root, sourceFiles, manifests));
  for (const file of sourceFiles) {
    errors.push(
      ...contractLifecycleGlobalErrors(
        file,
        sourcePackageName(file),
        readFileSync(resolve(root, file), 'utf8')
      )
    );
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
