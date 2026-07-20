import ts from 'typescript';

import {
  collectFunctionLikeFindings,
  createAdvisoryTypeScriptContext,
} from './advisory-typescript-helpers.mjs';
const READ_LIKE_FUNCTION_PATTERN = /^(?:get|load|read|hydrate|guard|parse|normalize)[A-Z]/u;
const COMPAT_KEYWORD_PATTERN = /(?:legacy|migrate|repair|fallback|normalize)/iu;
const WRITE_ON_READ_PATTERN = [
  /\b(?:setItem|save[A-Z]|write[A-Z]|persist[A-Z]|update[A-Z]|put[A-Z]?)\b/u,
  /\bchrome\.storage\.[a-z]+\.(?:set|remove)\b/u,
  /\blocalStorage\.(?:setItem|removeItem)\b/u,
  /\bbrowserStorage\.[a-z]+\.(?:set|remove)\b/u,
];
const TRANSPORT_FILE_PATTERN =
  /(?:transport|runtime(?:-messaging)?|message|messages|commands?|runtime)\.[cm]?[jt]sx?$/u;

export function collectReadTransportFindings(file, createFinding) {
  const context = createAdvisoryTypeScriptContext(file);
  if (!context) {
    return [];
  }

  const { relativePath, sourceFile } = context;
  const text = sourceFile.getFullText();

  return [
    ...collectReadPathCompatFindings(relativePath, sourceFile, createFinding),
    ...collectTransportCatalogFindings(relativePath, sourceFile, text, createFinding),
  ];
}

function collectReadPathCompatFindings(relativePath, sourceFile, createFinding) {
  return collectFunctionLikeFindings(sourceFile, ({ bodyText, functionName, line }) => {
    if (
      READ_LIKE_FUNCTION_PATTERN.test(functionName) &&
      COMPAT_KEYWORD_PATTERN.test(bodyText) &&
      WRITE_ON_READ_PATTERN.some((pattern) => pattern.test(bodyText))
    ) {
      return [
        createFinding({
          family: 'Read-path compat / normalization drift',
          file: relativePath,
          line,
          reason: [
            `Read-like function "${functionName}" mixes compat/normalization`,
            'logic with write behavior.',
          ].join(' '),
          hint: 'Move repair-on-read work into an explicit write/migration seam and keep read paths read-only.',
          severity: 'attention',
        }),
      ];
    }

    return [];
  });
}

function collectTransportCatalogFindings(relativePath, sourceFile, text, createFinding) {
  if (!TRANSPORT_FILE_PATTERN.test(relativePath)) {
    return [];
  }

  const exportedFunctionCount = sourceFile.statements.reduce((count, statement) => {
    if (isExportedFunctionDeclaration(statement)) {
      return count + 1;
    }
    if (!isExportedVariableStatement(statement)) {
      return count;
    }

    return (
      count +
      statement.declarationList.declarations.filter((declaration) =>
        ts.isIdentifier(declaration.name)
      ).length
    );
  }, 0);

  const sendCallCount = [...text.matchAll(/\bsendRuntimeMessage\(/gu)].length;
  if (exportedFunctionCount < 8 && sendCallCount < 6) {
    return [];
  }

  return [
    createFinding({
      family: 'Transport/command catalog pressure',
      file: relativePath,
      reason: [
        `Transport-like file exposes ${exportedFunctionCount} exports`,
        `and ${sendCallCount} runtime send wrappers.`,
      ].join(' '),
      hint: 'Split command families by domain slice before the transport surface turns into one large catalog.',
    }),
  ];
}

function isExportedFunctionDeclaration(statement) {
  return (
    ts.isFunctionDeclaration(statement) &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function isExportedVariableStatement(statement) {
  return (
    ts.isVariableStatement(statement) &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}
