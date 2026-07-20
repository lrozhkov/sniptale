import { isAllowedZodFunctionConstructor } from './artifact-security-zod-allowlist.mjs';
import {
  isIdentifierCharacter,
  isWhitespace,
  readIdentifierAt,
} from './artifact-security-source-text.mjs';
import ts from 'typescript';

const FUNCTION_ALIAS_SCAN_WINDOW_CHARS = 500;
const FUNCTION_ALIAS_DECLARATION_KINDS = ['const', 'let', 'var'];

function hasIdentifierBoundary(text, start, end) {
  const previous = start > 0 ? text[start - 1] : '';
  const next = end < text.length ? text[end] : '';

  return !isIdentifierCharacter(previous) && !isIdentifierCharacter(next);
}

function skipWhitespace(text, index) {
  let cursor = index;
  while (isWhitespace(text[cursor] ?? '')) {
    cursor += 1;
  }

  return cursor;
}

function findFunctionAliasDeclarations(text) {
  const declarations = [];
  for (const kind of FUNCTION_ALIAS_DECLARATION_KINDS) {
    let offset = 0;
    while (offset < text.length) {
      const kindIndex = text.indexOf(kind, offset);
      if (kindIndex === -1) {
        break;
      }

      offset = kindIndex + kind.length;
      if (!hasIdentifierBoundary(text, kindIndex, kindIndex + kind.length)) {
        continue;
      }

      const aliasStart = skipWhitespace(text, kindIndex + kind.length);
      const alias = readIdentifierAt(text, aliasStart);
      if (!alias) {
        continue;
      }

      const assignmentStart = skipWhitespace(text, alias.end);
      if (text[assignmentStart] !== '=') {
        continue;
      }

      const functionStart = skipWhitespace(text, assignmentStart + 1);
      if (
        text.slice(functionStart, functionStart + 'Function'.length) !== 'Function' ||
        !hasIdentifierBoundary(text, functionStart, functionStart + 'Function'.length)
      ) {
        continue;
      }

      declarations.push({
        alias: alias.value,
        end: functionStart + 'Function'.length,
        functionStart,
        index: kindIndex,
      });
    }
  }

  return declarations.sort((left, right) => left.index - right.index);
}

function findBlockScopedEnd(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isBlock(current) ||
      ts.isCaseBlock(current) ||
      ts.isModuleBlock(current) ||
      ts.isSourceFile(current)
    ) {
      return current.end;
    }
    current = current.parent;
  }

  return null;
}

function findFunctionScopedEnd(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current) && current.body) {
      return current.body.end;
    }
    if (ts.isSourceFile(current)) {
      return current.end;
    }
    current = current.parent;
  }

  return null;
}

function collectFunctionAliasScopeEnds(text) {
  const sourceFile = ts.createSourceFile(
    'release-artifact.js',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const scopeEnds = new Map();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === 'Function'
    ) {
      const declarationList = node.parent;
      const isBlockScoped =
        ts.isVariableDeclarationList(declarationList) &&
        (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
      const scopeEnd = isBlockScoped ? findBlockScopedEnd(node) : findFunctionScopedEnd(node);
      if (scopeEnd !== null) {
        scopeEnds.set(node.initializer.getStart(sourceFile), scopeEnd);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return scopeEnds;
}

function findAliasedFunctionCallIndexes(text, alias) {
  const indexes = [];
  let offset = 0;
  while (offset < text.length) {
    const aliasIndex = text.indexOf(alias, offset);
    if (aliasIndex === -1) {
      break;
    }

    offset = aliasIndex + alias.length;
    if (!hasIdentifierBoundary(text, aliasIndex, aliasIndex + alias.length)) {
      continue;
    }

    let cursor = aliasIndex + alias.length;
    cursor = skipWhitespace(text, cursor);

    if (text[cursor] === '(') {
      indexes.push(aliasIndex);
      continue;
    }

    const newPrefixStart = aliasIndex - 4;
    if (
      newPrefixStart >= 0 &&
      text.slice(newPrefixStart, aliasIndex) === 'new ' &&
      hasIdentifierBoundary(text, newPrefixStart, newPrefixStart + 3) &&
      text[cursor] === '('
    ) {
      indexes.push(newPrefixStart);
    }
  }

  return indexes;
}

function verifyDirectFunctionConstructors(relativePath, text) {
  for (const matchIndex of findAliasedFunctionCallIndexes(text, 'Function')) {
    if (isAllowedZodFunctionConstructor(text, matchIndex)) {
      continue;
    }

    throw new Error(`Release artifact ${relativePath} contains forbidden dynamic code execution.`);
  }
}

function verifyAliasedFunctionConstructors(relativePath, text) {
  const scopeEnds = collectFunctionAliasScopeEnds(text);
  for (const declaration of findFunctionAliasDeclarations(text)) {
    const scanStart = declaration.end;
    const scanEnd = Math.min(
      scanStart + FUNCTION_ALIAS_SCAN_WINDOW_CHARS,
      scopeEnds.get(declaration.functionStart) ?? text.length
    );
    const scanWindow = text.slice(scanStart, scanEnd);
    for (const aliasCallIndex of findAliasedFunctionCallIndexes(scanWindow, declaration.alias)) {
      const callIndex = scanStart + aliasCallIndex;
      if (isAllowedZodFunctionConstructor(text, callIndex, { alias: declaration.alias })) {
        continue;
      }

      throw new Error(
        `Release artifact ${relativePath} contains forbidden aliased dynamic code execution.`
      );
    }
  }
}

export function verifyDynamicCodeUsage(relativePath, text) {
  verifyDirectFunctionConstructors(relativePath, text);
  verifyAliasedFunctionConstructors(relativePath, text);
}
