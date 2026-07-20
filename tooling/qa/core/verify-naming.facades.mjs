import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { collectRenameSourceByTarget } from './import-only-diff.mjs';
import { collectCodeFiles, toRelativePath } from './shared.mjs';
import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';

const REPEATED_CHILD_PREFIX_MIN_COUNT = 3;

function getFacadeStem(absolutePath) {
  return path.parse(absolutePath).name.split('.')[0];
}

function isAmbiguousSameNameFacadeModule(statement, absolutePath) {
  const moduleSpecifier = statement.moduleSpecifier?.text;
  if (!moduleSpecifier || !moduleSpecifier.startsWith('./')) {
    return false;
  }

  return moduleSpecifier === `./${getFacadeStem(absolutePath)}`;
}

function isAllowedFacadeStatement(statement, absolutePath) {
  if (ts.isImportDeclaration(statement)) {
    return (
      statement.importClause != null && !isAmbiguousSameNameFacadeModule(statement, absolutePath)
    );
  }

  if (ts.isExportDeclaration(statement)) {
    return !isAmbiguousSameNameFacadeModule(statement, absolutePath);
  }

  return false;
}

export function hasAmbiguousSameNameFacadeSource(absolutePath) {
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const isFacadeLikeSource = sourceFile.statements.every((statement) => {
    if (ts.isImportDeclaration(statement)) {
      return statement.importClause != null;
    }

    return ts.isExportDeclaration(statement);
  });

  if (!isFacadeLikeSource) {
    return false;
  }

  return sourceFile.statements.some((statement) =>
    isAmbiguousSameNameFacadeModule(statement, absolutePath)
  );
}

export function isThinFacadeSource(absolutePath) {
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);

  return sourceFile.statements.every((statement) =>
    isAllowedFacadeStatement(statement, absolutePath)
  );
}

function collectHeadFiles() {
  const result = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    return [];
  }
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

export function collectWorkspaceNamingDelta() {
  const targets = collectChangedTargets({ scope: 'workspace' });
  const renamedTargets = collectRenameSourceByTarget().keys();
  const pathFiles = [
    ...new Set([...targets.addedFiles, ...targets.untrackedFiles, ...renamedTargets]),
  ].filter((file) => fs.existsSync(path.join(process.cwd(), file)));
  return {
    currentFiles: collectCodeFiles().map(toRelativePath),
    pathFiles,
    previousFiles: collectHeadFiles(),
  };
}

function getLeadingToken(value) {
  return value.split('-')[0];
}

function getRepeatedChildTokenGroup(parentGroups, parent, leadingToken) {
  const parentGroup = parentGroups.get(parent) ?? new Map();
  const tokenGroup = parentGroup.get(leadingToken) ?? new Map([['__hasHyphenChild', false]]);
  parentGroup.set(leadingToken, tokenGroup);
  parentGroups.set(parent, parentGroup);
  return tokenGroup;
}

function buildRepeatedChildPrefixGroups(entries) {
  const parentGroups = new Map();
  for (const { relativePath } of entries) {
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length - 1; index += 1) {
      const parent = segments.slice(0, index).join('/');
      const child = segments[index];
      const leadingToken = getLeadingToken(child);
      if (!leadingToken) continue;
      const tokenGroup = getRepeatedChildTokenGroup(parentGroups, parent, leadingToken);
      if (!tokenGroup.has(child)) tokenGroup.set(child, relativePath);
      if (child.includes('-')) tokenGroup.set('__hasHyphenChild', true);
    }
  }
  return parentGroups;
}

function getChildEntries(tokenGroup) {
  return [...(tokenGroup?.entries() ?? [])].filter(([child]) => child !== '__hasHyphenChild');
}

function createRepeatedChildPrefixViolation(parent, leadingToken, childEntries) {
  const children = childEntries.map(([child]) => child).sort();
  const [, representativeFile] = childEntries.sort(([left], [right]) =>
    left.localeCompare(right)
  )[0];
  return {
    file: representativeFile,
    message:
      `owner "${parent}" has repeated child prefix "${leadingToken}" across ` +
      `${children.join(', ')}. Collapse to role-only child owners or introduce a clearer seam.`,
    rule: 'repeated-child-prefix-topology',
  };
}

export function collectRepeatedChildPrefixViolations(entries, baselineEntries = []) {
  const violations = [];
  const baselineGroups = buildRepeatedChildPrefixGroups(baselineEntries);
  for (const [parent, parentGroup] of buildRepeatedChildPrefixGroups(entries)) {
    for (const [leadingToken, tokenGroup] of parentGroup) {
      const childEntries = getChildEntries(tokenGroup);
      const baselineCount = getChildEntries(baselineGroups.get(parent)?.get(leadingToken)).length;
      if (
        tokenGroup.get('__hasHyphenChild') !== true ||
        childEntries.length < REPEATED_CHILD_PREFIX_MIN_COUNT ||
        childEntries.length <= baselineCount
      ) {
        continue;
      }
      violations.push(createRepeatedChildPrefixViolation(parent, leadingToken, childEntries));
    }
  }
  return violations;
}
