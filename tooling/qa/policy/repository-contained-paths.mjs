import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { posix } from 'node:path';

function pathError(path) {
  return new Error(`unsafe repository path: ${String(path)}`);
}

function isContained(root, path) {
  const difference = relative(root, path);
  return difference === '' || (!difference.startsWith('..') && !isAbsolute(difference));
}

/** Accept only canonical POSIX paths relative to the repository root. */
export function assertRepositoryRelativePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.includes('\\') ||
    isAbsolute(path) ||
    /^[a-z]:/iu.test(path)
  )
    throw pathError(path);
  const normalized = posix.normalize(path);
  if (
    normalized !== path ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  )
    throw pathError(path);
  return normalized;
}

function assertNoSymlinkAncestor(root, path, relativePath) {
  const segments = posix
    .dirname(relativePath)
    .split('/')
    .filter((segment) => segment !== '.');
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw pathError(path);
  }
}

function repositoryPath(root, path) {
  const rootPath = realpathSync(root);
  const relativePath = assertRepositoryRelativePath(path);
  const absolute = resolve(rootPath, relativePath);
  if (!isContained(rootPath, absolute)) throw pathError(path);
  assertNoSymlinkAncestor(rootPath, absolute, relativePath);
  return absolute;
}

function rootDirectory(root) {
  const rootPath = realpathSync(root);
  const details = lstatSync(rootPath);
  if (details.isSymbolicLink() || !details.isDirectory()) throw pathError(root);
  return rootPath;
}

function directoryPath(root, path) {
  const absolute = path === '' || path === '.' ? rootDirectory(root) : repositoryPath(root, path);
  if (!existsSync(absolute)) throw pathError(path);
  const details = lstatSync(absolute);
  if (details.isSymbolicLink() || !details.isDirectory()) throw pathError(path);
  return absolute;
}

function childPath(parent, entry) {
  return parent === '' || parent === '.' ? entry : `${parent}/${entry}`;
}

/** Read a repository directory without following a symlink at any level. */
export function readRepositoryDirectory(root, path = '.') {
  const absolute = directoryPath(root, path);
  return readdirSync(absolute, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, path: childPath(path, entry.name) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function walkRepositoryTree(root, path, includeDirectories) {
  const results = [];
  function visit(relativePath) {
    if (includeDirectories && relativePath !== path) results.push(relativePath);
    for (const entry of readRepositoryDirectory(root, relativePath)) {
      const child = repositoryPath(root, entry.path);
      const details = lstatSync(child);
      if (details.isSymbolicLink()) throw pathError(entry.path);
      if (details.isDirectory()) visit(entry.path);
      else if (details.isFile() && !includeDirectories) results.push(entry.path);
    }
  }
  visit(path);
  return results.sort();
}

/** Enumerate regular files below a repository-owned directory, failing closed on symlinks. */
export function walkRepositoryFiles(root, path = '.') {
  return walkRepositoryTree(root, path, false);
}

/** Enumerate nested directories below a repository-owned directory, failing closed on symlinks. */
export function walkRepositoryDirectories(root, path = '.') {
  return walkRepositoryTree(root, path, true);
}

/** Resolve a trusted existing regular file from a repository-relative index entry. */
export function resolveRepositoryRegularFile(root, path) {
  const absolute = repositoryPath(root, path);
  if (
    !existsSync(absolute) ||
    lstatSync(absolute).isSymbolicLink() ||
    !lstatSync(absolute).isFile()
  )
    throw pathError(path);
  return absolute;
}

/** Resolve a repository-contained output path without following symlinked ancestors. */
export function resolveRepositoryWritePath(root, path) {
  const absolute = repositoryPath(root, path);
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) throw pathError(path);
  return absolute;
}

export function readRepositoryJson(root, path) {
  return JSON.parse(readFileSync(resolveRepositoryRegularFile(root, path), 'utf8'));
}
