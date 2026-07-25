import fs from 'node:fs';
import path from 'node:path';

import { isProductQaFile } from './qa-scope.mjs';
import { filterImportOrMockOnlyDiffFiles } from './import-only-diff.mjs';
import { collectCodeFiles, fromRelativePath, isCodeFile } from './shared.mjs';
import { isBuildTestFile } from './build-test-file-classifier.mjs';
import { collectDeletedTargetSuccessors } from './verify-build.deleted-closure.mjs';
import { resolveBuildTestProfile } from './verify-build.test-profiles.mjs';
export {
  BUILD_TEST_EXECUTION_CLASSES,
  BUILD_TEST_PROFILE_LIMITS,
  SATURATED_RELATED_INPUT_LIMIT,
} from './verify-build.test-profiles.mjs';

const RUNTIME_ENTRYPOINT_PATTERN = new RegExp(
  '^(?:apps/extension/src/' +
    '(?:background|camera-recorder|content|design-system|gallery|offscreen|' +
    'effect-runtime-sandbox|popup|settings|web-snapshot-viewer|editor|video-editor|' +
    'scenario-editor))/' +
    '(?:index|bootstrap|runtime|entrypoint)\\.[cm]?[jt]sx?$',
  'u'
);
const PARSER_SNAPSHOT_EXPORT_NAME_PATTERN =
  /(?:^|\/)(?:dom-tree-parser|parser|snapshot|markdown-rendering|project-export|scenario-export)(?=\/|[.-])/u;
const EXPORT_OWNER_PATH_PATTERN = /(?:^|\/)export(?:\/|\.)/u;
const MESSAGING_RUNTIME_PATH_TOKENS = new Set([
  'message-bridge',
  'message-listener',
  'message-sync',
  'message-tracer',
  'messaging',
  'native-messaging',
  'runtime-bridge',
  'runtime-effects',
  'runtime-message',
  'runtime-message-listener',
  'runtime-messaging',
  'runtime-routing',
  'tab-message-routing',
  'worker-message-boundary',
]);
const RUNTIME_TRANSPORT_PATH_TOKENS = new Set(['bridge', 'transport']);

function segmentMatchesToken(segment, token) {
  return segment === token || segment.startsWith(`${token}.`);
}

function hasPathToken(file, tokens) {
  return file
    .split('/')
    .some((segment) => [...tokens].some((token) => segmentMatchesToken(segment, token)));
}

function isRuntimeTransportOwner(file) {
  const segments = file.split('/');
  return segments.some(
    (segment, index) =>
      segment === 'runtime' &&
      hasPathToken(segments.slice(index + 1).join('/'), RUNTIME_TRANSPORT_PATH_TOKENS)
  );
}
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
      return hasPathToken(file, MESSAGING_RUNTIME_PATH_TOKENS) || isRuntimeTransportOwner(file);
    },
    collectPrefixes(file) {
      return collectFamilyPrefixes(file, [
        'bridge',
        'transport',
        'runtime-bridge',
        'runtime-effects',
        'runtime-message',
        'runtime-message-listener',
        'runtime-messaging',
        'runtime-routing',
        'message-bridge',
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
      return /(?:storage|persistence)/u.test(file) || /(?:^|[./-])db(?:[./-]|$)/u.test(file);
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
  return isBuildTestFile(file);
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
  const lastDirectoryIndex = segments.length - 2;
  const matchingIndexes = segments
    .map((segment, index) => {
      const candidate = index === segments.length - 1 ? path.posix.parse(segment).name : segment;
      return index >= 2 && familySegments.includes(candidate) ? index : -1;
    })
    .filter((index) => index >= 0);
  if (matchingIndexes.length === 0 || lastDirectoryIndex < 0) return [];
  const closestFamilyIndex = matchingIndexes.at(-1);
  const ownerIndex = Math.min(closestFamilyIndex + 1, lastDirectoryIndex);
  return [`${segments.slice(0, ownerIndex + 1).join('/')}/`];
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
  riskTargetFiles = targetFiles,
  codeFiles = [],
  addedFiles = [],
  repoCodeFiles = collectCodeFiles(),
  focusedScopeResolver,
  ownerTestResolver,
  deletedSuccessorResolver = collectDeletedTargetSuccessors,
} = {}) {
  const behavioralTargetFiles = filterImportOrMockOnlyDiffFiles(targetFiles);
  const behavioralRiskTargetFiles = filterImportOrMockOnlyDiffFiles(riskTargetFiles);
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const productChangedTargetFiles = targetFiles.filter(isProductQaFile);
  const productChangedCodeFiles = codeFiles.filter(isProductQaFile);
  const productTargetFiles = behavioralTargetFiles.filter(isProductQaFile);
  const productRiskTargetFiles = behavioralRiskTargetFiles.filter(isProductQaFile);
  const productCodeFiles = behavioralCodeFiles.filter(isProductQaFile);
  const productAddedFiles = addedFiles.filter(isProductQaFile);
  const productRepoCodeFiles = repoCodeFiles.filter(isProductQaFile);
  const directTestFiles = uniqueSorted(productCodeFiles.filter(isTestFile));
  const productionCodeFiles = productCodeFiles.filter((file) => !isTestFile(file));
  const productionTargetFiles = productTargetFiles.filter(
    (file) => !isTestFile(file) && (isCodeFile(file) || file === 'apps/extension/manifest.json')
  );
  const changedProductionCodeFiles = productChangedCodeFiles.filter(
    (file) => !isTestFile(file) && isCodeFile(file)
  );
  const changedProductionTargetFiles = productChangedTargetFiles.filter(
    (file) => !isTestFile(file) && (isCodeFile(file) || file === 'apps/extension/manifest.json')
  );
  const existingNonCodeProductionFiles = productionTargetFiles.filter(
    (file) => file === 'apps/extension/manifest.json' && fs.existsSync(fromRelativePath(file))
  );
  const availableProductionFiles = uniqueSorted([
    ...productionCodeFiles,
    ...existingNonCodeProductionFiles,
  ]);
  const productionCodeFileSet = new Set(availableProductionFiles);
  const unavailableProductionFiles = productionTargetFiles.filter(
    (file) => !productionCodeFileSet.has(file)
  );
  const deletedSuccessorsByFile =
    unavailableProductionFiles.length === 0
      ? new Map()
      : deletedSuccessorResolver({
          productionCodeFiles: changedProductionCodeFiles,
          productionTargetFiles: changedProductionTargetFiles,
        });
  const unavailableProductionScopes = unavailableProductionFiles.map((file) => ({
    changedSuccessorFiles: Array.isArray(deletedSuccessorsByFile.get(file))
      ? deletedSuccessorsByFile.get(file)
      : (deletedSuccessorsByFile.get(file)?.files ?? []),
    file,
    successorProofKind: deletedSuccessorsByFile.get(file)?.proofKind ?? 'changed-consumers',
    relatedFiles: collectExpandedRelatedFiles([file], productRepoCodeFiles).relatedFiles,
  }));
  const { matchedFamilies, relatedFiles: expandedRelatedFiles } = collectExpandedRelatedFiles(
    productRiskTargetFiles,
    productRepoCodeFiles
  );

  return resolveBuildTestProfile({
    addedFiles: productAddedFiles,
    directTestFiles,
    focusedScopeResolver,
    matchedFamilies,
    ownerTestResolver,
    productTargetFiles,
    productionCodeFiles: availableProductionFiles,
    relatedFiles: uniqueSorted([
      ...productionCodeFiles,
      ...expandedRelatedFiles,
      ...directTestFiles,
    ]),
    unavailableProductionScopes,
  });
}

export function resolveBuildCloseoutScope(
  context,
  {
    repoCodeFiles = collectCodeFiles(),
    focusedScopeResolver,
    ownerTestResolver,
    deletedSuccessorResolver,
  } = {}
) {
  const testScope = resolveBuildTestScope({
    targetFiles: context.targetFiles,
    riskTargetFiles: context.qualityTargetFiles ?? context.targetFiles,
    codeFiles: context.codeFiles,
    addedFiles: context.addedFiles,
    repoCodeFiles,
    focusedScopeResolver,
    ownerTestResolver,
    deletedSuccessorResolver,
  });

  return {
    staticScope: 'repo-wide',
    testScope,
  };
}
