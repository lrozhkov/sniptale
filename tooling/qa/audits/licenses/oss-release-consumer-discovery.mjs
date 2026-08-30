import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

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
  'tooling/configs/qa/control-dispositions.data.json',
  'tooling/configs/qa/oss-release.data.json',
  'tooling/configs/qa/technical-debt.data.json',
  'tooling/qa/audits/licenses/oss-release-consumer-discovery.mjs',
  'tooling/qa/audits/licenses/oss-release-inventory.mjs',
  'tooling/qa/audits/licenses/oss-release-validation/docs.mjs',
  'tooling/qa/audits/licenses/oss-release-validation/policy.mjs',
  'tooling/qa/audits/licenses/oss-release-surface/check.mjs',
  'tooling/release/policy/oss-release-policy.mjs',
]);
const FONT_LITERAL_PATTERN =
  /(?:manrope-(?:cyrillic|latin-ext|latin)-wght-normal\.woff2|@fontsource-variable\/manrope\/files\/manrope-|marck-script-(?:cyrillic|latin)-400-normal\.woff2|@fontsource\/marck-script\/files\/marck-script-)/u;
const VALIDATOR_PATTERN =
  /(?:qa\.rule\.oss-release-surface|verify-oss-release-surface(?:\.mjs)?|OSS release surface)/u;
const ARCHIVE_PATTERN =
  /(?:from ['"].*oss-release-policy\.mjs['"]|package-dist\.mjs|release:package-only|verify-release-archive\.mjs)/u;
const RELEASE_COMMAND_PATTERN = /"(?:ci:(?:proof|release)|qa:release-harness)"\s*:/u;

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
      }));
    })
    .sort((left, right) =>
      left.path === right.path
        ? left.category.localeCompare(right.category)
        : left.path.localeCompare(right.path)
    );
}
