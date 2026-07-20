/**
 * Broad interface surface guardrail.
 * Blocks newly introduced or widened store/hook/controller param surfaces in changed code.
 */

import fs from 'node:fs';
import ts from 'typescript';

import { createHeadFileTextResolver } from './git-head-sources.mjs';
import { QUALITY_LIMITS } from './quality.config.mjs';
import { collectSurfaceMaps, didSurfaceGrow } from './surface-growth.helpers.mjs';
import { collectBroadPublicSurfaceViolations } from './verify-interface-surfaces.broad-public.helpers.mjs';
import { runReturnedObjectSurfaceAdvisoryCheck } from './verify-interface-surfaces.return-bags.mjs';
import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  toRelativePath,
} from './shared.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

const SURFACE_NAME_PATTERN = /(?:State|Params|Args|Controller|Slice|Bindings)$/u;
const DEFAULT_MEMBER_LIMIT = 20;

export {
  collectReturnedObjectSurfaceAdvisories,
  collectReturnedObjectSurfaceViolations,
  runReturnedObjectSurfaceAdvisoryCheck,
  runReturnedObjectSurfaceCheck,
  runRepoWideReturnedObjectSurfaceCheck,
} from './verify-interface-surfaces.return-bags.mjs';

function createViolation(rule, file, message, line) {
  return { rule, file, line, message };
}

function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectNamedSurfaces(sourceFile) {
  const surfaces = new Map();

  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && SURFACE_NAME_PATTERN.test(node.name.text)) {
      surfaces.set(node.name.text, {
        name: node.name.text,
        members: node.members.length,
        line: getNodeLine(sourceFile, node),
      });
    }

    if (
      ts.isTypeAliasDeclaration(node) &&
      SURFACE_NAME_PATTERN.test(node.name.text) &&
      ts.isTypeLiteralNode(node.type)
    ) {
      surfaces.set(node.name.text, {
        name: node.name.text,
        members: node.type.members.length,
        line: getNodeLine(sourceFile, node),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return surfaces;
}

export { collectBroadPublicSurfaceViolations };

function createSourceFile(filePath, text) {
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

function createSurfaceBreadthViolation(relativePath, surface, previousSurface, memberLimit) {
  const isNewSurface = !previousSurface;
  const message = isNewSurface
    ? [
        `Introduces broad interface surface "${surface.name}" with ${surface.members} members`,
        `(limit ${memberLimit}). Split the param bag or narrow the ownership seam.`,
      ].join(' ')
    : [
        `Grows broad interface surface "${surface.name}" from ${previousSurface.members}`,
        `to ${surface.members} members`,
        `(limit ${memberLimit}). Extract or narrow the seam before expanding it further.`,
      ].join(' ');

  return createViolation('interface-surface-breadth', relativePath, message, surface.line);
}

function collectFileInterfaceSurfaceViolations({
  filePath,
  memberLimit,
  relativePath,
  resolvePreviousSource,
}) {
  const currentText = fs.readFileSync(filePath, 'utf8');
  const { currentSurfaces, previousSurfaces } = collectSurfaceMaps({
    filePath,
    relativePath,
    currentSourceFile: createSourceFile(filePath, currentText),
    collectSurfaces: collectNamedSurfaces,
    resolvePreviousSource,
    createPreviousSourceFile: createSourceFile,
  });
  const violations = [];

  for (const surface of currentSurfaces.values()) {
    const previousSurface = previousSurfaces.get(surface.name);
    if (surface.members >= memberLimit && didSurfaceGrow(surface, previousSurface)) {
      violations.push(
        createSurfaceBreadthViolation(relativePath, surface, previousSurface, memberLimit)
      );
    }
  }

  return violations;
}

export function collectInterfaceSurfaceViolations(
  files,
  { getPreviousSource = null, memberLimit = DEFAULT_MEMBER_LIMIT } = {}
) {
  const violations = [];
  const resolvePreviousSource =
    getPreviousSource ??
    createHeadFileTextResolver(files.map((filePath) => toRelativePath(filePath)));

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (!/\.(?:ts|tsx)$/u.test(relativePath) || relativePath.endsWith('.d.ts')) {
      continue;
    }

    violations.push(
      ...collectFileInterfaceSurfaceViolations({
        filePath,
        memberLimit,
        relativePath,
        resolvePreviousSource,
      }),
      ...collectBroadPublicSurfaceViolations([filePath], {
        getPreviousSource: resolvePreviousSource,
      })
    );
  }

  return violations;
}

export function runInterfaceSurfaceCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });
  return {
    skipped: targetFiles.length === 0,
    files: targetFiles.map(toRelativePath),
    limits: {
      maxMembers: DEFAULT_MEMBER_LIMIT,
      maxFileLines: QUALITY_LIMITS.maxFileLines,
      maxFunctionLines: QUALITY_LIMITS.maxFunctionLines,
    },
    violations: collectInterfaceSurfaceViolations(targetFiles),
  };
}

export function runRepoWideInterfaceSurfaceCheck() {
  return runInterfaceSurfaceCheck({ scope: 'repo-wide' });
}

if (isExecutedAsScript(import.meta.url)) {
  const args = process.argv.slice(2);
  const reportReturnBags = args.includes('--report-return-bags');
  const repoWide = args.includes('--repo-wide');
  const reportOnly = args.includes('--report-only');
  const explicitFiles = parseFilesArgument(
    args.filter(
      (arg) => arg !== '--report-return-bags' && arg !== '--repo-wide' && arg !== '--report-only'
    )
  );
  const scope = repoWide ? 'repo-wide' : 'workspace';

  if (reportReturnBags) {
    const result = runReturnedObjectSurfaceAdvisoryCheck({ files: explicitFiles, scope });

    if (result.skipped) {
      process.stdout.write(
        scope === 'repo-wide'
          ? 'Interface surface advisory repo report skipped: no matching production code files\n'
          : 'Interface surface advisory skipped: no changed code files\n'
      );
      process.exit(0);
    }

    if (result.advisories.length > 0) {
      printViolations('Broad returned object surface advisories found:', result.advisories);
      process.exit(0);
    }

    process.stdout.write('Broad returned object surface advisory passed\n');
    process.exit(0);
  }

  const result = runInterfaceSurfaceCheck({ files: explicitFiles, scope });

  if (result.skipped) {
    process.stdout.write(
      scope === 'repo-wide'
        ? 'Interface surface repo report skipped: no code files\n'
        : 'Interface surface check skipped: no changed code files\n'
    );
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Broad interface surface violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write(
    scope === 'repo-wide'
      ? 'Broad interface surface repo report passed\n'
      : 'Broad interface surface guardrail passed\n'
  );
}
