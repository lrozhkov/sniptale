import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { collectRecursiveFiles } from '../../../analysis/repository/recursive-files.mjs';
import { createTypeScriptSourceFile } from '../../../analysis/source/typescript-ast-helpers.mjs';

function collectFiles(rootDir, predicate) {
  if (!fs.existsSync(rootDir)) return [];
  return collectRecursiveFiles(rootDir, {
    predicate: (filePath, entry) => predicate(filePath, entry.name),
    returnAbsolute: true,
  });
}

function getPackageExportSpecifiers(packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return new Set(
    Object.keys(packageJson.exports ?? {}).map((exportPath) =>
      exportPath === '.' ? '@sniptale/ui' : `@sniptale/ui${exportPath.slice(1)}`
    )
  );
}

function getPropertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

function getObjectProperties(objectLiteral) {
  return new Map(
    objectLiteral.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = getPropertyName(property.name);
      return name ? [[name, property.initializer]] : [];
    })
  );
}

function getStringLiteral(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function getStringArray(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.flatMap((element) => {
    const value = getStringLiteral(element);
    return value === null ? [] : [value];
  });
}

function isRegistryArrayType(typeNode) {
  if (!typeNode) return false;
  if (ts.isArrayTypeNode(typeNode)) {
    return ts.isTypeReferenceNode(typeNode.elementType) &&
      ts.isIdentifier(typeNode.elementType.typeName)
      ? typeNode.elementType.typeName.text === 'DesignSystemRegistryEntry'
      : false;
  }
  return false;
}

function projectRegistryEntries(filePath) {
  const sourceFile = createTypeScriptSourceFile(filePath);
  const entries = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      isRegistryArrayType(node.type) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const properties = getObjectProperties(element);
        entries.push({
          componentId: getStringLiteral(properties.get('componentId')),
          scope: getStringLiteral(properties.get('scope')),
          source: getStringLiteral(properties.get('source')),
          sourceFiles: getStringArray(properties.get('sourceFiles')),
          status: getStringLiteral(properties.get('status')),
          previewFidelity: getStringLiteral(properties.get('previewFidelity')),
          canonicalImplementation: getStringLiteral(properties.get('canonicalImplementation')),
          canonicalPreview: getStringLiteral(properties.get('canonicalPreview')),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return entries;
}

function collectPreviewBindings(sourceFile) {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith('/support/provider') ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === 'designSystemPreview') {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function projectPreviewComponentIds(filePath) {
  const sourceFile = createTypeScriptSourceFile(filePath);
  const bindings = collectPreviewBindings(sourceFile);
  const componentIds = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      bindings.has(node.expression.text)
    ) {
      const componentId = getStringLiteral(node.arguments[0]);
      if (componentId !== null) componentIds.push(componentId);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return componentIds;
}

function isPackageUiSpecifier(value) {
  return value === '@sniptale/ui' || value?.startsWith('@sniptale/ui/');
}

export function collectRegistryEntries(registryRoot) {
  return collectFiles(
    registryRoot,
    (_, fileName) => fileName.endsWith('.data.ts') && !fileName.endsWith('.test.ts')
  ).flatMap(projectRegistryEntries);
}

export function collectPreviewComponentIds(previewRoot) {
  return [
    ...new Set(
      collectFiles(
        previewRoot,
        (_, fileName) => /\.[cm]?[jt]sx?$/u.test(fileName) && !/\.(?:test|spec)\./u.test(fileName)
      ).flatMap(projectPreviewComponentIds)
    ),
  ].sort();
}

export function getRegistryCoverageFailures({ registryEntries, previewComponentIds }) {
  const failures = [];
  if (registryEntries.length === 0) {
    failures.push('design-system registry must contain at least one typed entry');
  }
  const registryIds = new Set(
    registryEntries.map(({ componentId }) => componentId).filter(Boolean)
  );
  const previewIds = new Set(previewComponentIds);

  for (const componentId of registryIds) {
    if (!previewIds.has(componentId)) {
      failures.push(`${componentId} is missing design-system preview coverage`);
    }
  }
  for (const componentId of previewIds) {
    if (!registryIds.has(componentId)) {
      failures.push(`${componentId} has a real preview but is missing a registry entry`);
    }
  }
  return failures;
}

export function getRegistryReferenceFailures({ packageJsonPath, registryEntries, repoRoot }) {
  const failures = [];
  const packageExports = getPackageExportSpecifiers(packageJsonPath);
  const references = registryEntries.flatMap((entry) => [
    entry.source,
    ...entry.sourceFiles,
    entry.canonicalImplementation,
    entry.canonicalPreview,
  ]);
  const sourcePaths = new Set(
    references.filter(
      (value) => value?.startsWith('apps/extension/src/') || value?.startsWith('packages/ui/src/')
    )
  );
  const packageSpecifiers = new Set(references.filter(isPackageUiSpecifier));

  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(path.join(repoRoot, sourcePath))) {
      failures.push(`${sourcePath} is referenced by the design-system registry but does not exist`);
    }
  }
  for (const specifier of packageSpecifiers) {
    if (!packageExports.has(specifier)) {
      failures.push(`${specifier} is referenced by the design-system registry but is not exported`);
    }
  }
  return failures;
}

export function getCanonicalOwnershipFailures(registryEntries) {
  const failures = [];

  for (const entry of registryEntries) {
    const {
      componentId,
      scope,
      status,
      previewFidelity,
      canonicalImplementation,
      canonicalPreview,
    } = entry;
    if (!componentId || status !== 'active' || previewFidelity !== 'canonical') continue;

    const canonicalUiImplementationOwned =
      isPackageUiSpecifier(canonicalImplementation) ||
      canonicalImplementation?.startsWith('packages/ui/src/') ||
      canonicalImplementation?.startsWith('apps/extension/src/ui/');
    const canonicalImplementationOwned =
      canonicalUiImplementationOwned ||
      (scope === 'shared-ui' &&
        (canonicalImplementation?.startsWith('apps/extension/src/design-system/previews/') ||
          canonicalImplementation?.startsWith('apps/extension/src/features/')));
    if (!canonicalImplementationOwned) {
      failures.push(`${componentId} canonical implementation must live under a canonical UI owner`);
    }

    const sharedPreviewOwned =
      isPackageUiSpecifier(canonicalPreview) ||
      canonicalPreview?.startsWith('packages/ui/src/') ||
      canonicalPreview?.startsWith('apps/extension/src/ui/') ||
      canonicalPreview?.startsWith('apps/extension/src/design-system/previews/');
    const productPreviewOwned =
      isPackageUiSpecifier(canonicalPreview) ||
      canonicalPreview?.startsWith('packages/ui/src/') ||
      canonicalPreview?.startsWith('apps/extension/src/design-system/previews/');

    if (!canonicalPreview || (scope === 'shared-ui' ? !sharedPreviewOwned : !productPreviewOwned)) {
      failures.push(
        `${componentId} canonical preview must live under a canonical UI preview owner`
      );
    }
  }
  return failures;
}

function inspectThemeSource(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const sourceFile = createTypeScriptSourceFile(filePath);
  const facts = {
    calls: new Set(),
    jsxElements: new Set(),
    dataUiValues: new Set(),
  };

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      facts.calls.add(node.expression.text);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName)) facts.jsxElements.add(node.tagName.text);
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.text === 'data-ui' &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer)
        ) {
          facts.dataUiValues.add(attribute.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return facts;
}

export function getDesignSystemThemeFailures(designSystemRoot) {
  const themePath = path.join(designSystemRoot, 'theme', 'index.tsx');
  const indexFacts = inspectThemeSource(path.join(designSystemRoot, 'index.tsx'));
  const pageFacts = inspectThemeSource(path.join(designSystemRoot, 'shell', 'page', 'index.tsx'));
  const themeFacts = inspectThemeSource(themePath);
  if (!themeFacts) {
    return [
      'apps/extension/src/design-system/theme/index.tsx is required for design-system-owned theme scoping',
    ];
  }

  const failures = [];
  if (indexFacts?.calls.has('initializeAppTheme')) {
    failures.push(
      'apps/extension/src/design-system/index.tsx must not initialize a global app theme'
    );
  }
  if (!indexFacts?.jsxElements.has('DesignSystemThemeSurface')) {
    failures.push(
      'apps/extension/src/design-system/index.tsx must render through DesignSystemThemeSurface'
    );
  }
  if (!themeFacts.dataUiValues.has('design-system.theme-surface')) {
    failures.push(
      'apps/extension/src/design-system/theme/index.tsx must expose data-ui="design-system.theme-surface"'
    );
  }
  if (!pageFacts?.calls.has('useDesignSystemThemeSurface')) {
    failures.push(
      'apps/extension/src/design-system/shell/page/index.tsx must consume the design-system-owned theme surface'
    );
  }
  return failures;
}
