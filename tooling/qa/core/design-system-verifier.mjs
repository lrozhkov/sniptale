import fs from 'node:fs';
import path from 'node:path';
import { collectRecursiveFiles } from './recursive-files.mjs';

const blockedImportPatterns = [
  /from\s+['"][^'"]*shared\/components(?:\/index)?['"]/,
  /from\s+['"][^'"]*popup\/components\/PopupActionButton['"]/,
];

function collectFiles(rootDir) {
  return collectRecursiveFiles(rootDir, {
    predicate: (_, entry) => /\.(ts|tsx)$/.test(entry.name),
    returnAbsolute: true,
  });
}

function collectRegistryEntries(registrySource) {
  return [
    ...registrySource.matchAll(
      /componentId:\s*'([^']+)'[\s\S]*?status:\s*'(active|planned)'[\s\S]*?}/g
    ),
  ].map((match) => match[0]);
}

function isPackageUiSpecifier(value) {
  return value === '@sniptale/ui' || value?.startsWith('@sniptale/ui/');
}

export function collectRegistrySource(
  sharedUiRoot,
  registryRoot = path.join(sharedUiRoot, 'design-system-registry')
) {
  return collectFiles(registryRoot)
    .filter((filePath) => filePath.endsWith('.ts'))
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
}

export function collectPreviewSource(designSystemRoot, sharedUiRoot) {
  return fs
    .readdirSync(designSystemRoot)
    .filter(
      (fileName) => fileName.startsWith('design-system-preview') && /\.(ts|tsx)$/.test(fileName)
    )
    .map((fileName) => fs.readFileSync(path.join(designSystemRoot, fileName), 'utf8'))
    .concat(
      collectFiles(sharedUiRoot)
        .filter(
          (filePath) =>
            filePath.endsWith('.design-system.tsx') ||
            filePath.endsWith('/design-system.tsx') ||
            /\/preview[^/]*\.[cm]?[jt]sx?$/u.test(filePath) ||
            filePath.endsWith('/previews.tsx')
        )
        .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    )
    .join('\n');
}

export function getPublicUiFiles(sharedUiRoot) {
  return fs
    .readdirSync(sharedUiRoot)
    .filter(
      (fileName) =>
        fileName.endsWith('.tsx') && !fileName.endsWith('.test.tsx') && fileName !== 'index.ts'
    )
    .map((fileName) => `packages/ui/src/${fileName}`);
}

export function getFeatureBypassFailures({
  featureRoots,
  familyClassBypassRules,
  ignoredFiles,
  repoRoot,
}) {
  const failures = [];

  for (const rootDir of featureRoots) {
    for (const filePath of collectFiles(rootDir)) {
      if (ignoredFiles.has(filePath)) {
        continue;
      }

      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(repoRoot, filePath).replaceAll(path.sep, '/');

      for (const pattern of blockedImportPatterns) {
        if (pattern.test(source)) {
          failures.push(`${relativePath} bypasses design-system imports`);
          break;
        }
      }

      for (const rule of familyClassBypassRules) {
        if (rule.allowlist.has(filePath)) {
          continue;
        }

        if (rule.classPatterns.some((pattern) => pattern.test(source))) {
          failures.push(`${relativePath} bypasses ${rule.familyId} via raw class contracts`);
        }
      }
    }
  }

  return failures;
}

export function getRegistryCoverageFailures({ registrySource, previewSource, publicUiFiles }) {
  const failures = [];

  for (const relativeFile of publicUiFiles) {
    if (!registrySource.includes(relativeFile)) {
      failures.push(`${relativeFile} is missing a registry source entry`);
    }
  }

  const componentIds = [...registrySource.matchAll(/componentId:\s*'([^']+)'/g)].map(
    (match) => match[1]
  );

  for (const componentId of componentIds) {
    if (!previewSource.includes(componentId)) {
      failures.push(`${componentId} is missing design-system preview coverage`);
    }
  }

  return failures;
}

export function getRegistryPathFailures({ registrySource, repoRoot }) {
  const failures = [];
  const sourcePaths = [
    ...new Set(
      [...registrySource.matchAll(/['"]((?:src|apps\/extension\/src)\/[^'"]+)['"]/g)]
        .map((match) => match[1])
        .sort()
    ),
  ];

  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(path.join(repoRoot, sourcePath))) {
      failures.push(`${sourcePath} is referenced by the design-system registry but does not exist`);
    }
  }

  return failures;
}

export function getCanonicalOwnershipFailures(registrySource) {
  const failures = [];

  for (const entrySource of collectRegistryEntries(registrySource)) {
    const componentId = entrySource.match(/componentId:\s*'([^']+)'/)?.[1];
    const scope = entrySource.match(/scope:\s*'(shared-ui|product-ui)'/)?.[1];
    const status = entrySource.match(/status:\s*'(active|planned)'/)?.[1];
    const previewFidelity = entrySource.match(/previewFidelity:\s*'(canonical|illustrative)'/)?.[1];
    const canonicalImplementation = entrySource.match(/canonicalImplementation:\s*'([^']+)'/)?.[1];
    const canonicalPreview = entrySource.match(/canonicalPreview:\s*'([^']+)'/)?.[1];

    if (!componentId || status !== 'active' || previewFidelity !== 'canonical') {
      continue;
    }

    const isCanonicalUiImplementation =
      isPackageUiSpecifier(canonicalImplementation) ||
      canonicalImplementation?.startsWith('packages/ui/src/') ||
      canonicalImplementation?.startsWith('apps/extension/src/ui/');
    if (!isCanonicalUiImplementation) {
      failures.push(`${componentId} canonical implementation must live under a canonical UI owner`);
    }

    const isValidSharedPreview =
      isPackageUiSpecifier(canonicalPreview) ||
      canonicalPreview?.startsWith('packages/ui/src/') ||
      canonicalPreview?.startsWith('apps/extension/src/ui/') ||
      canonicalPreview?.startsWith('apps/extension/src/design-system');

    if (scope === 'shared-ui') {
      if (!canonicalPreview || !isValidSharedPreview) {
        failures.push(
          `${componentId} canonical preview must live under a UI owner or apps/extension/src/design-system`
        );
      }
      continue;
    }

    if (
      !canonicalPreview ||
      (!isPackageUiSpecifier(canonicalPreview) &&
        !canonicalPreview.startsWith('packages/ui/src/') &&
        !canonicalPreview.startsWith('apps/extension/src/ui/'))
    ) {
      failures.push(`${componentId} canonical preview must live under a canonical UI owner`);
    }
  }

  return failures;
}
