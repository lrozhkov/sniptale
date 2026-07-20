import { existsSync, lstatSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import ts from 'typescript';

import { isExecutedAsScript, repoRoot } from './shared.mjs';
import { readSourceFile } from './architecture-guardrails.helpers.mjs';
import { collectModuleReferenceLiterals } from './verify-canonical-facades.helpers.mjs';
import {
  currentLegacyReferenceRecords,
  currentRepositoryPaths,
} from './target-only-path-inventory.mjs';
import { readTargetOnlyPathPolicy } from './target-only-path-policy.mjs';
import { retiredTargetOnlyControl } from './target-only-path-references.mjs';
import { docsTopologyErrors } from './docs-topology.mjs';

const RETIRED_SPECIFIERS = [
  /^src\/(?:manifest\.json|vite-env\.d\.ts)$/u,
  /^src\/(?:background|camera-recorder|composition|content|contracts|design-system)(?:\/|$)/u,
  /^src\/(?:editor|features|foundation|gallery|offscreen|effect-runtime-sandbox|package-renderer-sandbox)(?:\/|$)/u,
  /^src\/(?:platform|popup|scenario-editor|settings|shared|ui|video-editor)(?:\/|$)/u,
  /^src\/(?:web-snapshot-viewer|workflows)(?:\/|$)/u,
];
const RETIRED_EFFECT_V1_SPECIFIERS = [
  /^apps\/extension\/src\/package-renderer-sandbox(?:\/|$)/u,
  /^apps\/extension\/src\/features\/video\/project\/video-pack(?:\/|$)/u,
  /^apps\/extension\/src\/composition\/persistence\/template-packs(?:\/|$)/u,
  /^apps\/extension\/src\/features\/video\/composition\/(?:template-instances|package-renderer)(?:\/|$)/u,
  /^apps\/extension\/src\/offscreen\/project-export\/package-renderer(?:\/|$)/u,
  /^apps\/extension\/src\/video-editor\/preview\/stage\/scene\/package-renderer-cache(?:\/|$)/u,
];
const SOURCE_READER_CALLS = new Set(['createReadStream', 'readFile', 'readFileSync']);

function isRetiredSpecifier(path) {
  return [...RETIRED_SPECIFIERS, ...RETIRED_EFFECT_V1_SPECIFIERS].some((pattern) =>
    pattern.test(path)
  );
}

function normalizedModulePath(importer, specifier) {
  if (specifier.startsWith('.')) {
    return posix.normalize(posix.join(posix.dirname(importer), specifier));
  }
  return specifier.replace(/^\//u, '');
}

function pathEntryExists(root, path) {
  try {
    lstatSync(resolve(root, path));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function retiredControlErrors(root, policy, paths) {
  const errors = [];
  for (const entry of policy.retiredControls) {
    if (pathEntryExists(root, entry.path))
      errors.push(`retired migration control remains: ${entry.path}`);
  }
  for (const prefix of policy.retiredControlPrefixes) {
    if (paths.some((path) => path.startsWith(prefix))) {
      errors.push(`retired migration control prefix remains: ${prefix}`);
    }
  }
  for (const path of policy.requiredTargets) {
    if (!existsSync(resolve(root, path))) errors.push(`target-only artifact is missing: ${path}`);
  }
  return errors;
}

function retiredPhysicalPathErrors(root, policy) {
  const roots = [...policy.physicalRetiredRoots, ...policy.retiredRootFiles].flatMap((path) =>
    pathEntryExists(root, path) ? [`retired root path remains: ${path}`] : []
  );
  const effectV1Paths = policy.effectV1RetiredPaths.flatMap((path) =>
    pathEntryExists(root, path) ? [`retired EffectV1 migration path remains: ${path}`] : []
  );
  return [...roots, ...effectV1Paths];
}

function sourceReadingReferences(sourceFile) {
  const references = [];
  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(sourceFile) === 'URL' &&
      ts.isStringLiteral(node.arguments?.[0])
    ) {
      references.push({ literal: node.arguments[0], node });
    }
    if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(sourceFile).split('.').at(-1);
      if (SOURCE_READER_CALLS.has(callName) && ts.isStringLiteral(node.arguments[0])) {
        references.push({ literal: node.arguments[0], node });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}

function sourceReadingErrors(path, sourceFile, policy) {
  return sourceReadingReferences(sourceFile).flatMap(({ literal, node }) => {
    const normalized = normalizedModulePath(path, literal.text);
    if (!isRetiredSpecifier(normalized) && !retiredTargetOnlyControl(normalized, policy)) {
      return [];
    }
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    return [`stale source-reading path: ${path}:${line} -> ${literal.text}`];
  });
}

function moduleReferenceErrors(root, paths, policy) {
  return paths
    .filter((path) => /\.[cm]?[jt]sx?$/u.test(path) && existsSync(resolve(root, path)))
    .flatMap((path) => {
      const sourceFile = readSourceFile(root, path);
      const moduleErrors = collectModuleReferenceLiterals(sourceFile).flatMap(
        ({ literal, line }) =>
          isRetiredSpecifier(normalizedModulePath(path, literal.text)) ||
          retiredTargetOnlyControl(normalizedModulePath(path, literal.text), policy)
            ? [`stale module path: ${path}:${line} -> ${literal.text}`]
            : []
      );
      return [...moduleErrors, ...sourceReadingErrors(path, sourceFile, policy)];
    });
}

export function targetOnlyPathErrors(root = repoRoot) {
  const policy = readTargetOnlyPathPolicy(root);
  const paths = currentRepositoryPaths(root);
  const staleRecords = currentLegacyReferenceRecords(root).filter(
    (record) => record.classification === 'active-stale-reference'
  );
  return [
    ...docsTopologyErrors(root),
    ...retiredPhysicalPathErrors(root, policy),
    ...retiredControlErrors(root, policy, paths),
    ...moduleReferenceErrors(root, paths, policy),
    ...staleRecords.map(
      (record) =>
        `active legacy path reference: ${record.path}:${record.line} -> ${record.reference}`
    ),
  ].sort();
}

export function runTargetOnlyPathCheck({ root = repoRoot } = {}) {
  return { violations: targetOnlyPathErrors(root) };
}

if (isExecutedAsScript(import.meta.url)) {
  const errors = targetOnlyPathErrors();
  if (errors.length > 0) {
    process.stderr.write(`Target-only path violations found:\n${errors.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('Target-only paths: OK\n');
}
