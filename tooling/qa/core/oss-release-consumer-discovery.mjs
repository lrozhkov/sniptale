import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const OSS_RELEASE_CONSUMER_MANIFEST_PATH =
  'tooling/configs/qa/oss-release-consumers.data.json';

const IGNORED_DIRECTORY_NAMES = new Set(['.git', '.tmp', 'build', 'dist', 'node_modules']);
const IGNORED_ROOT_DIRECTORY_NAMES = new Set(['tasks']);
const TEXT_FILE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);
const TEST_FILE_PATTERN = /(?:^|\/)[^/]+\.(?:test|spec)(?:-support)?\.[cm]?[jt]sx?$/u;
const SELF_PATHS = new Set([
  OSS_RELEASE_CONSUMER_MANIFEST_PATH,
  'tooling/configs/qa/oss-release.data.json',
  'tooling/qa/core/oss-release-consumer-discovery.mjs',
  'tooling/qa/core/oss-release-inventory.mjs',
  'tooling/qa/core/oss-release-validation.docs.mjs',
  'tooling/qa/core/oss-release-validation.policy.mjs',
  'tooling/qa/core/verify-oss-release-surface.mjs',
  'tooling/release/oss-release-policy.mjs',
]);
const FONT_LITERAL_PATTERN =
  /(?:manrope-(?:cyrillic|latin-ext|latin)-wght-normal\.woff2|@fontsource-variable\/manrope\/files\/manrope-)/u;
const VALIDATOR_PATTERN = /(?:verify-oss-release-surface(?:\.mjs)?|OSS release surface)/u;
const ARCHIVE_PATTERN =
  /(?:from ['"].*oss-release-policy\.mjs['"]|package-dist\.mjs|release:package-only|verify-release-archive\.mjs)/u;
const RELEASE_COMMAND_PATTERN = /"qa:(?:release|audit|release-harness)"\s*:/u;

function normalize(relativePath) {
  return relativePath.replaceAll(path.sep, '/');
}

function collectTextFiles(root, relativeDirectory = '') {
  const directory = path.resolve(root, relativeDirectory || '.');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = normalize(path.join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      if (
        (IGNORED_DIRECTORY_NAMES.has(entry.name) && relativePath !== 'apps/extension/build') ||
        (!relativeDirectory && IGNORED_ROOT_DIRECTORY_NAMES.has(entry.name))
      ) {
        return [];
      }
      return collectTextFiles(root, relativePath);
    }
    return TEXT_FILE_EXTENSIONS.has(path.extname(entry.name)) ? [relativePath] : [];
  });
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function categoriesFor(relativePath, contents) {
  if (SELF_PATHS.has(relativePath) || TEST_FILE_PATTERN.test(relativePath)) return [];
  const categories = [];
  if (VALIDATOR_PATTERN.test(contents)) categories.push('validator-integration');
  if (ARCHIVE_PATTERN.test(contents)) categories.push('archive-integration');
  if (FONT_LITERAL_PATTERN.test(contents)) categories.push('bundled-font');
  if (relativePath.endsWith('package.json') && RELEASE_COMMAND_PATTERN.test(contents)) {
    categories.push('release-command');
  }
  return categories;
}

export function discoverOssReleaseConsumers(root = process.cwd()) {
  return collectTextFiles(root)
    .flatMap((relativePath) => {
      const contents = readFileSync(path.resolve(root, relativePath), 'utf8');
      return categoriesFor(relativePath, contents).map((category) => ({
        category,
        path: relativePath,
        sha256: sha256(contents),
      }));
    })
    .sort((left, right) =>
      left.path === right.path
        ? left.category.localeCompare(right.category)
        : left.path.localeCompare(right.path)
    );
}

export async function writeOssReleaseConsumerManifest({
  root = process.cwd(),
  outputPath = OSS_RELEASE_CONSUMER_MANIFEST_PATH,
} = {}) {
  const manifest = {
    schemaVersion: 1,
    consumers: discoverOssReleaseConsumers(root),
  };
  const destination = path.resolve(root, outputPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function readOssReleaseConsumerManifest(root = process.cwd(), manifestPath) {
  const relativePath = manifestPath ?? OSS_RELEASE_CONSUMER_MANIFEST_PATH;
  return JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeOssReleaseConsumerManifest();
  process.stdout.write(`OSS release consumers: ${OSS_RELEASE_CONSUMER_MANIFEST_PATH}\n`);
}
