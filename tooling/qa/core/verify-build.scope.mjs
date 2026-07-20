import fs from 'node:fs';
import path from 'node:path';

import { isProductQaFile } from './qa-scope.mjs';
import { collectCodeFiles, fromRelativePath, isCodeFile } from './shared.mjs';
import { resolveBuildTestProfile } from './verify-build.test-profiles.mjs';
export { BUILD_TEST_PROFILE_LIMITS } from './verify-build.test-profiles.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const RUNTIME_ENTRYPOINT_PATTERN = new RegExp(
  '^(?:apps/extension/src/' +
    '(?:background|camera-recorder|content|design-system|gallery|offscreen|' +
    'effect-runtime-sandbox|popup|settings|web-snapshot-viewer|editor|video-editor|' +
    'scenario-editor))/' +
    '(?:index|bootstrap|runtime|entrypoint)\\.[cm]?[jt]sx?$',
  'u'
);
const PARSER_SNAPSHOT_EXPORT_NAME_PATTERN =
  /(dom-tree-parser|parser|snapshot|markdown-rendering|project-export|scenario-export)/u;
const EXPORT_OWNER_PATH_PATTERN = /(?:^|\/)export(?:\/|\.)/u;
const BUILD_SCOPE_FAMILIES = [
  {
    name: 'package-and-app-core',
    matches(file) {
      return (
        file.startsWith('packages/') ||
        /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\//u.test(
          file
        )
      );
    },
    collectPrefixes(file) {
      return collectOwnerPrefixes(file, [
        'composition',
        'contracts',
        'features',
        'foundation',
        'platform',
        'ui',
        'workflows',
      ]);
    },
  },
  {
    name: 'parser-snapshot-export',
    matches(file) {
      return PARSER_SNAPSHOT_EXPORT_NAME_PATTERN.test(file) || EXPORT_OWNER_PATH_PATTERN.test(file);
    },
    collectPrefixes(file) {
      return collectFamilyPrefixes(file, [
        'dom-tree-parser',
        'parser',
        'snapshot',
        'markdown-rendering',
        'project-export',
        'scenario-export',
        'export',
      ]);
    },
  },
  {
    name: 'messaging-runtime',
    matches(file) {
      return /(?:runtime|messag(?:e|ing))/u.test(file);
    },
    collectPrefixes(file) {
      return collectFamilyPrefixes(file, [
        'runtime',
        'runtime-bridge',
        'runtime-effects',
        'runtime-message-listener',
        'runtime-messaging',
        'runtime-routing',
        'runtime-state',
        'message-listener',
        'message-sync',
        'message-tracer',
        'messaging',
      ]);
    },
  },
  {
    name: 'storage-persistence',
    matches(file) {
      return /(?:storage|persistence|db)/u.test(file);
    },
    collectPrefixes(file) {
      return collectFamilyPrefixes(file, [
        'storage',
        'preference-service',
        'storage-errors',
        'quota',
        'persistence',
        'db',
      ]);
    },
  },
  {
    name: 'manifest-owned',
    matches(file) {
      return file === 'apps/extension/manifest.json';
    },
    collectPrefixes() {
      return [];
    },
    collectExtraFiles(repoCodeFiles) {
      return repoCodeFiles.filter((candidate) => RUNTIME_ENTRYPOINT_PATTERN.test(candidate));
    },
  },
];

function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function collectOwnerPrefixes(file, rootNames = []) {
  const segments = file.split('/');
  if (segments.length < 3 || segments[0] !== 'src' || !rootNames.includes(segments[1])) {
    return [];
  }

  if (segments.length >= 4) {
    return [`${segments.slice(0, 3).join('/')}/`];
  }

  const stem = path.posix.basename(file, path.posix.extname(file));
  const siblingOwnerPath = `src/${segments[1]}/${stem}`;
  const absoluteSiblingOwnerPath = fromRelativePath(siblingOwnerPath);
  return fs.existsSync(absoluteSiblingOwnerPath) &&
    fs.statSync(absoluteSiblingOwnerPath).isDirectory()
    ? [`${siblingOwnerPath}/`]
    : [];
}

function collectFamilyPrefixes(file, familySegments = []) {
  const segments = file.split('/');
  const prefixes = [];

  for (const [index, segment] of segments.entries()) {
    if (index < 2 || !familySegments.includes(segment)) {
      continue;
    }

    prefixes.push(`${segments.slice(0, index + 1).join('/')}/`);
  }

  return uniqueSorted(prefixes);
}

function collectExpandedRelatedFiles(targetFiles, repoCodeFiles) {
  const matchedFamilies = new Set();
  const relatedPrefixes = new Set();
  const relatedFiles = new Set();

  for (const family of BUILD_SCOPE_FAMILIES) {
    const matchingTargets = targetFiles.filter((file) => family.matches(file));
    if (matchingTargets.length === 0) {
      continue;
    }

    matchedFamilies.add(family.name);
    for (const targetFile of matchingTargets) {
      for (const prefix of family.collectPrefixes(targetFile)) {
        relatedPrefixes.add(prefix);
      }
    }

    if (typeof family.collectExtraFiles === 'function') {
      for (const file of family.collectExtraFiles(repoCodeFiles)) {
        if (!isTestFile(file)) {
          relatedFiles.add(file);
        }
      }
    }
  }

  for (const prefix of relatedPrefixes) {
    for (const repoCodeFile of repoCodeFiles) {
      if (!isTestFile(repoCodeFile) && repoCodeFile.startsWith(prefix)) {
        relatedFiles.add(repoCodeFile);
      }
    }
  }

  return {
    matchedFamilies: [...matchedFamilies].sort(),
    relatedFiles: [...relatedFiles].sort(),
  };
}

export function resolveBuildTestScope({
  targetFiles = [],
  codeFiles = [],
  addedFiles = [],
  repoCodeFiles = collectCodeFiles(),
  focusedScopeResolver,
  ownerTestResolver,
} = {}) {
  const productTargetFiles = targetFiles.filter(isProductQaFile);
  const productCodeFiles = codeFiles.filter(isProductQaFile);
  const productAddedFiles = addedFiles.filter(isProductQaFile);
  const productRepoCodeFiles = repoCodeFiles.filter(isProductQaFile);
  const directTestFiles = uniqueSorted(productTargetFiles.filter(isTestFile));
  const productionCodeFiles = productCodeFiles.filter((file) => !isTestFile(file));
  const productionTargetFiles = productTargetFiles.filter(
    (file) => !isTestFile(file) && (isCodeFile(file) || file === 'apps/extension/manifest.json')
  );
  const productionCodeFileSet = new Set(productionCodeFiles);
  const unavailableProductionScopes = productionTargetFiles
    .filter((file) => !productionCodeFileSet.has(file))
    .map((file) => ({
      file,
      relatedFiles: collectExpandedRelatedFiles([file], productRepoCodeFiles).relatedFiles,
    }));
  const { matchedFamilies, relatedFiles: expandedRelatedFiles } = collectExpandedRelatedFiles(
    productTargetFiles,
    productRepoCodeFiles
  );

  return resolveBuildTestProfile({
    addedFiles: productAddedFiles,
    directTestFiles,
    focusedScopeResolver,
    matchedFamilies,
    ownerTestResolver,
    productTargetFiles,
    productionCodeFiles,
    relatedFiles: uniqueSorted([
      ...productionCodeFiles,
      ...expandedRelatedFiles,
      ...directTestFiles,
    ]),
    unavailableProductionScopes,
  });
}

export function resolveBuildCloseoutScope(context, { repoCodeFiles = collectCodeFiles() } = {}) {
  const testScope = resolveBuildTestScope({
    targetFiles: context.targetFiles,
    codeFiles: context.codeFiles,
    addedFiles: context.addedFiles,
    repoCodeFiles,
  });

  return {
    staticScope: 'repo-wide',
    testScope,
  };
}
