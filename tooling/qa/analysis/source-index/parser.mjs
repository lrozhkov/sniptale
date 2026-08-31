import ts from 'typescript';

function hasModifier(node, modifierKind) {
  return node.modifiers?.some((modifier) => modifier.kind === modifierKind) ?? false;
}

function collectBindingNames(bindingName, names = []) {
  if (ts.isIdentifier(bindingName)) {
    names.push(bindingName.text);
    return names;
  }
  for (const element of bindingName.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, names);
  }
  return names;
}

function collectLocalDeclarationKinds(sourceFile) {
  const kinds = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of collectBindingNames(declaration.name)) {
          kinds.set(name, 'VariableDeclaration');
        }
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      kinds.set(statement.name.text, ts.SyntaxKind[statement.kind]);
    }
  }
  return kinds;
}

function pushExport(exports, exportName, kind) {
  if (!exportName) return;
  exports.push({ exportName, kind });
}

function collectModifierExports(statement, exports) {
  if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) return;
  const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      for (const name of collectBindingNames(declaration.name)) {
        pushExport(exports, name, 'VariableDeclaration');
      }
    }
    return;
  }
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    const name = statement.name && ts.isIdentifier(statement.name) ? statement.name.text : null;
    pushExport(exports, isDefault ? 'default' : name, ts.SyntaxKind[statement.kind]);
  }
}

function collectLocalExportList(statement, localKinds, exports) {
  if (
    !ts.isExportDeclaration(statement) ||
    statement.moduleSpecifier ||
    !statement.exportClause ||
    !ts.isNamedExports(statement.exportClause)
  ) {
    return;
  }

  for (const element of statement.exportClause.elements) {
    const localName = element.propertyName?.text ?? element.name.text;
    const fallbackKind = statement.isTypeOnly || element.isTypeOnly ? 'TypeAliasDeclaration' : null;
    pushExport(exports, element.name.text, localKinds.get(localName) ?? fallbackKind);
  }
}

function collectExports(sourceFile) {
  const exports = [];
  const localKinds = collectLocalDeclarationKinds(sourceFile);
  for (const statement of sourceFile.statements) {
    collectModifierExports(statement, exports);
    collectLocalExportList(statement, localKinds, exports);
    if (ts.isExportAssignment(statement)) {
      pushExport(exports, 'default', 'ExportAssignment');
    }
  }
  return exports.filter(({ kind }) => kind != null);
}

function collectImportUsage(statement, imports) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return;
  const names = [];
  const clause = statement.importClause;
  if (clause?.name) names.push('default');
  if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push('*');
  if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      names.push(element.propertyName?.text ?? element.name.text);
    }
  }
  if (names.length > 0) imports.push({ specifier: statement.moduleSpecifier.text, names });
}

function collectReExportUsage(statement, imports) {
  if (
    !ts.isExportDeclaration(statement) ||
    !statement.moduleSpecifier ||
    !ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return;
  }
  const names = [];
  if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
    names.push('*');
  } else if (ts.isNamedExports(statement.exportClause)) {
    for (const element of statement.exportClause.elements) {
      names.push(element.propertyName?.text ?? element.name.text);
    }
  }
  if (names.length > 0) imports.push({ specifier: statement.moduleSpecifier.text, names });
}

function collectDynamicImports(sourceFile, imports) {
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      (ts.isStringLiteral(node.arguments[0]) ||
        ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      imports.push({ specifier: node.arguments[0].text, names: ['*'] });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

export function parseSourceRecord({ sourceFile }) {
  const imports = [];
  for (const statement of sourceFile.statements) {
    collectImportUsage(statement, imports);
    collectReExportUsage(statement, imports);
  }
  collectDynamicImports(sourceFile, imports);

  return { exports: collectExports(sourceFile), imports };
}
