import ts from 'typescript';

import { createAdvisoryTypeScriptContext } from './advisory-typescript-helpers.mjs';
const SERVICE_SCOPE_PATTERN = /^src\/(?:shared|background|offscreen)\//u;
const PROPS_FAMILY_PATTERN = /\bbuild[A-Z][A-Za-z0-9]+Props\b/gu;
const PROPS_SPREAD_PATTERN = /\.\.\.\s*build[A-Z][A-Za-z0-9]+Props\(/gu;
const LAZY_OWNER_HELPER_PATTERN = /^createLazy[A-Z]/u;
const MUTABLE_NAME_PATTERN =
  /(listeners?|queue|pending|active|sessions?|registry|buffer|observers?|timestamps?|jobs?|stack|cache)/iu;
const MUTATING_COLLECTION_METHOD_PATTERN = /^(?:add|clear|delete|push|set|splice|unshift)$/u;

function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isMutableModuleCollection(initializer) {
  return (
    ts.isNewExpression(initializer) &&
    ts.isIdentifier(initializer.expression) &&
    /^(?:Map|Set)$/u.test(initializer.expression.text)
  );
}

export function collectStaticStructureFindings(file, createFinding) {
  const context = createAdvisoryTypeScriptContext(file, {
    excludeTestSupport: true,
    includeText: true,
  });
  if (!context) {
    return [];
  }

  const { relativePath, sourceFile, text } = context;

  return [
    ...collectSingletonFindings(relativePath, sourceFile, createFinding),
    ...collectMutableModuleStateFindings(relativePath, sourceFile, createFinding),
    ...collectPropsBuilderFindings(relativePath, text, createFinding),
  ];
}

function collectMutatedModuleCollections(sourceFile) {
  const mutatedCollections = new Set();

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      MUTATING_COLLECTION_METHOD_PATTERN.test(node.expression.name.text)
    ) {
      mutatedCollections.add(node.expression.expression.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return mutatedCollections;
}

function collectMutatedModuleBindings(sourceFile) {
  const mutatedBindings = collectMutatedModuleCollections(sourceFile);

  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) &&
      ts.isIdentifier(node.left.expression)
    ) {
      mutatedBindings.add(node.left.expression.text);
    }

    if (
      ts.isDeleteExpression(node) &&
      (ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression)) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      mutatedBindings.add(node.expression.expression.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return mutatedBindings;
}

function collectSingletonFindings(relativePath, sourceFile, createFinding) {
  if (!SERVICE_SCOPE_PATTERN.test(relativePath)) {
    return [];
  }

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) {
      return [];
    }

    return statement.declarationList.declarations.flatMap((declaration) => {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression)
      ) {
        return [];
      }

      const variableName = declaration.name.text;
      const initializerName = declaration.initializer.expression.text;
      if (
        !/^default[A-Z]/u.test(variableName) ||
        !/^create[A-Z]/u.test(initializerName) ||
        LAZY_OWNER_HELPER_PATTERN.test(initializerName)
      ) {
        return [];
      }

      return [
        createFinding({
          family: 'Shared singleton/service roots',
          file: relativePath,
          line: getNodeLine(sourceFile, declaration),
          reason: `Top-level singleton "${variableName}" is created at import time.`,
          hint: 'Prefer explicit init/service owner wiring over another implicit singleton root.',
        }),
      ];
    });
  });
}

function collectMutableModuleStateFindings(relativePath, sourceFile, createFinding) {
  if (!SERVICE_SCOPE_PATTERN.test(relativePath)) {
    return [];
  }

  const mutatedBindings = collectMutatedModuleBindings(sourceFile);

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) {
      return [];
    }

    return statement.declarationList.declarations.flatMap((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        return [];
      }

      const variableName = declaration.name.text;
      const hasMutableNameHint = MUTABLE_NAME_PATTERN.test(variableName);
      const isMutatedBinding = mutatedBindings.has(variableName);
      if (!hasMutableNameHint && !isMutatedBinding) {
        return [];
      }

      return createMutableStateFinding({
        createFinding,
        declaration,
        isMutatedBinding,
        relativePath,
        sourceFile,
        variableName,
      });
    });
  });
}

function createMutableStateFinding({
  createFinding,
  declaration,
  isMutatedBinding,
  relativePath,
  sourceFile,
  variableName,
}) {
  if (isMutableModuleCollection(declaration.initializer)) {
    return [
      createFinding({
        family: 'Hidden mutable module state',
        file: relativePath,
        line: getNodeLine(sourceFile, declaration),
        reason: [
          `Module-scope "${variableName}" keeps live mutable`,
          `${declaration.initializer.expression.text} state.`,
        ].join(' '),
        hint: 'Push mutable registries into an explicit service/runtime owner instead of module scope.',
      }),
    ];
  }

  const isMutableLiteralRegistry =
    (ts.isArrayLiteralExpression(declaration.initializer) ||
      ts.isObjectLiteralExpression(declaration.initializer)) &&
    isMutatedBinding;
  if (!isMutableLiteralRegistry) {
    return [];
  }

  return [
    createFinding({
      family: 'Hidden mutable module state',
      file: relativePath,
      line: getNodeLine(sourceFile, declaration),
      reason: `Module-scope "${variableName}" is mutated through a live object/array registry.`,
      hint: 'Prefer owned runtime/service state over a process-wide mutable array.',
    }),
  ];
}

function collectPropsBuilderFindings(relativePath, text, createFinding) {
  const uniqueBuildProps = [
    ...new Set([...text.matchAll(PROPS_FAMILY_PATTERN)].map((match) => match[0])),
  ];
  const spreadCount = [...text.matchAll(PROPS_SPREAD_PATTERN)].length;

  if (uniqueBuildProps.length < 3 && spreadCount < 3) {
    return [];
  }

  return [
    createFinding({
      family: 'Props-builder proliferation',
      file: relativePath,
      reason: [
        `Changed file leans on ${uniqueBuildProps.length} build*Props helpers`,
        `and ${spreadCount} props spreads.`,
      ].join(' '),
      hint: [
        'Reduce builder fan-out or narrow the public',
        'layout/controller surface instead of stacking more props builders.',
      ].join(' '),
    }),
  ];
}
