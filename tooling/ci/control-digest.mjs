import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CONTROL_ROOTS = Object.freeze([
  '.github/workflows',
  '.husky',
  'tooling/ci',
  'tooling/configs/ci',
  'tooling/configs/qa',
  'tooling/qa',
  'tooling/release',
  'tooling/test/mutation',
]);
const CONTROL_FILES = Object.freeze([
  '.dependency-cruiser.cjs',
  '.dockerignore',
  '.editorconfig',
  '.npmrc',
  '.oxfmtignore',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  'package.json',
  'package-lock.json',
  'playwright.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'vitest.config.ts',
]);
const CONTROL_FILE_PATTERNS = Object.freeze([
  /(?:^|\/)oxlint[.]config[.][cm]?[jt]s$/u,
  /(?:^|\/)playwright[.]config[.][cm]?[jt]s$/u,
  /(?:^|\/)postcss[.]config[.][cm]?[jt]s$/u,
  /(?:^|\/)tailwind[.]config[.][cm]?[jt]s$/u,
  /(?:^|\/)vite[.]config[.][cm]?[jt]s$/u,
  /(?:^|\/)vitest[.]config[.][cm]?[jt]s$/u,
]);
const EXCLUDED_NAMES = new Set(['.git', '.tmp', 'build', 'dist', 'node_modules']);
const DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies'];

function normalizeInternalDependencyVersions(owner, projectVersion) {
  if (!owner || typeof projectVersion !== 'string') return;
  for (const group of DEPENDENCY_GROUPS) {
    for (const [name, value] of Object.entries(owner[group] ?? {})) {
      if (name.startsWith('@sniptale/') && value === projectVersion) {
        owner[group][name] = '<workspace-version>';
      }
    }
  }
}

function controlBytes(file, bytes) {
  if (!['package.json', 'package-lock.json'].includes(file)) return bytes;
  const value = JSON.parse(bytes.toString('utf8'));
  const projectVersion = value.version ?? value.packages?.['']?.version;
  if (value.version === projectVersion) value.version = '<product-version>';
  normalizeInternalDependencyVersions(value, projectVersion);
  for (const [packagePath, owner] of Object.entries(value.packages ?? {})) {
    if (
      owner?.version === projectVersion &&
      (packagePath === '' ||
        packagePath === 'apps/extension' ||
        packagePath.startsWith('packages/'))
    ) {
      owner.version = '<product-version>';
    }
    normalizeInternalDependencyVersions(owner, projectVersion);
  }
  return Buffer.from(JSON.stringify(value));
}

function visit(cwd, relative, output) {
  const absolute = path.join(cwd, relative);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`QA control input may not be a symlink: ${relative}`);
  if (stat.isFile()) {
    output.add(relative.replaceAll(path.sep, '/'));
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    visit(cwd, path.join(relative, entry.name), output);
  }
}

function isDiscoveredControlFile(relative) {
  const normalized = relative.replaceAll(path.sep, '/');
  const basename = path.posix.basename(normalized);
  const isOxfmtConfig = basename === '.oxfmtrc' || basename.startsWith('.oxfmtrc.');
  const isOxlintConfig = basename === '.oxlintrc' || basename.startsWith('.oxlintrc.');
  const isTypeScriptConfig =
    basename === 'tsconfig.json' ||
    (basename.startsWith('tsconfig.') && basename.endsWith('.json'));
  return (
    isOxfmtConfig ||
    isOxlintConfig ||
    isTypeScriptConfig ||
    CONTROL_FILE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function visitMatching(cwd, relative, output) {
  const absolute = path.join(cwd, relative);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    if (isDiscoveredControlFile(relative)) {
      throw new Error(`QA control input may not be a symlink: ${relative}`);
    }
    return;
  }
  if (stat.isFile()) {
    const normalized = relative.replaceAll(path.sep, '/');
    if (isDiscoveredControlFile(normalized)) output.add(normalized);
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    visitMatching(cwd, path.join(relative, entry.name), output);
  }
}

export function createCandidateControlDigest({ cwd = process.cwd() } = {}) {
  const files = new Set();
  for (const root of CONTROL_ROOTS) visit(cwd, root, files);
  for (const file of CONTROL_FILES) visit(cwd, file, files);
  visitMatching(cwd, '.', files);
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort()) {
    const bytes = controlBytes(file, fs.readFileSync(path.join(cwd, file)));
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export { CONTROL_FILES, CONTROL_FILE_PATTERNS, CONTROL_ROOTS };
