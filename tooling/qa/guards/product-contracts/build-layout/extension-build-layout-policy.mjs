import { posix } from 'node:path';
import postcss from 'postcss';
import ts from 'typescript';

const REQUIRED_EXTERNAL_INPUTS = [
  'node_modules',
  'packages/foundation',
  'packages/platform',
  'packages/runtime-contracts',
  'packages/ui',
  'tooling/build/shims',
  'tooling/test/harness',
];

function canonicalRelativePath(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    posix.isAbsolute(relativePath) ||
    relativePath.includes('\\')
  ) {
    return null;
  }
  const normalized = posix.normalize(relativePath);
  return normalized === relativePath && normalized !== '.' && !normalized.startsWith('../')
    ? normalized
    : null;
}

function isWithin(relativePath, root) {
  const candidate = canonicalRelativePath(relativePath);
  const canonicalRoot = canonicalRelativePath(root);
  return Boolean(
    candidate &&
    canonicalRoot &&
    (candidate === canonicalRoot || candidate.startsWith(`${canonicalRoot}/`))
  );
}

export function isDeclaredExtensionBuildInput(relativePath, policy) {
  return (
    isWithin(relativePath, policy.appRoot) ||
    policy.externalInputRoots.some((root) => isWithin(relativePath, root))
  );
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getProperty(object, name) {
  return object?.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteral(property.name) && property.name.text === name))
  )?.initializer;
}

function unwrapExpression(node) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) return unwrapExpression(node.expression);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function findViteConfigObject(source) {
  const sourceFile = ts.createSourceFile('vite.config.ts', source, ts.ScriptTarget.Latest, true);
  const exportAssignment = sourceFile.statements.find(ts.isExportAssignment);
  if (!exportAssignment) return null;
  const exported = unwrapExpression(exportAssignment.expression);
  if (
    !ts.isCallExpression(exported) ||
    !ts.isIdentifier(exported.expression) ||
    exported.expression.text !== 'defineConfig'
  ) {
    return ts.isObjectLiteralExpression(exported) ? exported : null;
  }
  const argument = unwrapExpression(exported.arguments[0]);
  if (ts.isObjectLiteralExpression(argument)) return argument;
  if (!ts.isArrowFunction(argument) && !ts.isFunctionExpression(argument)) return null;
  if (ts.isBlock(argument.body)) {
    const returnStatement = argument.body.statements.find(ts.isReturnStatement);
    return returnStatement?.expression
      ? findObjectLiteral(unwrapExpression(returnStatement.expression))
      : null;
  }
  return findObjectLiteral(unwrapExpression(argument.body));
}

function findObjectLiteral(node) {
  return node && ts.isObjectLiteralExpression(node) ? node : null;
}

function normalizedNodeText(node) {
  return node?.getText().replaceAll(/\s+/gu, '') ?? '';
}

function hasCall(array, callee, argument = null) {
  return (
    array &&
    ts.isArrayLiteralExpression(array) &&
    array.elements.some((element) => {
      const expression = unwrapExpression(element);
      return (
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === callee &&
        (argument === null || normalizedNodeText(expression.arguments[0]) === argument)
      );
    })
  );
}

function policyShapeErrors(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) errors.push('layout schema must be version 1');
  if (!Number.isInteger(policy?.chunkSizeWarningLimitKb) || policy.chunkSizeWarningLimitKb <= 0) {
    errors.push('chunk size warning budget must be a positive integer');
  }
  if (policy?.appRoot !== 'apps/extension') errors.push('Vite app root must be apps/extension');
  if (policy?.manifestPath !== 'apps/extension/manifest.json') {
    errors.push('manifest must be app-owned');
  }
  if (policy?.publicRoot !== 'apps/extension/public') errors.push('public root must be app-owned');
  if (policy?.outputRoot !== 'dist') errors.push('artifact output must remain repository dist');
  if (policy?.forbiddenOutputRoot !== 'apps/extension/dist') {
    errors.push('app-local dist must remain explicitly forbidden');
  }
  if (!arraysEqual(policy?.externalInputRoots, REQUIRED_EXTERNAL_INPUTS)) {
    errors.push('external build inputs must match the bounded allowlist');
  }
  const htmlInputs = Array.isArray(policy?.htmlInputs) ? policy.htmlInputs : [];
  if (!Array.isArray(policy?.htmlInputs)) errors.push('HTML inputs must be an array');
  const outputPaths = htmlInputs.map((entry) => entry?.outputPath);
  if (new Set(outputPaths).size !== outputPaths.length) {
    errors.push('HTML output paths must be unique');
  }
  const rollupNames = htmlInputs.map((entry) => entry?.rollupName).filter((name) => name !== null);
  if (new Set(rollupNames).size !== rollupNames.length) {
    errors.push('HTML rollup names must be unique');
  }
  for (const entry of htmlInputs) {
    if (!entry || typeof entry !== 'object') {
      errors.push('HTML input entries must be objects');
      continue;
    }
    if (canonicalRelativePath(entry.outputPath) === null) {
      errors.push(`invalid HTML output path: ${String(entry.outputPath)}`);
    }
    if (!['always', 'manifest', 'non-release', 'security-e2e', 'test-e2e'].includes(entry.mode)) {
      errors.push(`unsupported HTML input mode: ${String(entry.mode)}`);
    }
    if (
      (entry.mode === 'manifest' && entry.rollupName !== null) ||
      (entry.mode !== 'manifest' && !/^[a-z][A-Za-z0-9]*$/u.test(entry.rollupName ?? ''))
    ) {
      errors.push(`invalid HTML rollup name for ${entry.outputPath}`);
    }
    if (!isDeclaredExtensionBuildInput(entry.sourcePath, policy)) {
      errors.push(`undeclared HTML source input: ${entry.sourcePath}`);
    }
  }
  const manifestModuleInputs = Array.isArray(policy?.manifestModuleInputs)
    ? policy.manifestModuleInputs
    : [];
  if (!Array.isArray(policy?.manifestModuleInputs)) {
    errors.push('manifest module inputs must be an array');
  }
  const manifestVirtualPaths = manifestModuleInputs.map((entry) => entry?.virtualPath);
  if (new Set(manifestVirtualPaths).size !== manifestVirtualPaths.length) {
    errors.push('manifest module virtual paths must be unique');
  }
  for (const entry of manifestModuleInputs) {
    if (!entry || typeof entry !== 'object') {
      errors.push('manifest module input entries must be objects');
      continue;
    }
    if (!isWithin(entry.virtualPath, policy.appRoot)) {
      errors.push(`manifest module virtual path must remain app-owned: ${entry.virtualPath}`);
    }
    if (!isDeclaredExtensionBuildInput(entry.sourcePath, policy)) {
      errors.push(`undeclared manifest module input: ${entry.sourcePath}`);
    }
  }
  for (const aliasPath of Object.values(policy?.aliases ?? {})) {
    if (!isDeclaredExtensionBuildInput(aliasPath, policy)) {
      errors.push(`undeclared alias input: ${aliasPath}`);
    }
  }
  const configPaths = policy?.configPaths ?? [];
  if (
    !Array.isArray(configPaths) ||
    configPaths.some((file) => canonicalRelativePath(file) === null) ||
    new Set(configPaths).size !== configPaths.length
  ) {
    errors.push('build config paths must be unique canonical repository paths');
  }
  const releaseArtifacts = policy?.requiredReleaseArtifacts ?? [];
  if (
    !Array.isArray(releaseArtifacts) ||
    releaseArtifacts.some((file) => canonicalRelativePath(file) === null) ||
    new Set(releaseArtifacts).size !== releaseArtifacts.length
  ) {
    errors.push('release artifacts must be unique canonical output paths');
  }
  return errors;
}

function commandAndDependencyErrors(policy, rootPackage, appPackage) {
  const errors = [];
  for (const [name, command] of Object.entries(policy.rootCommands ?? {})) {
    if (rootPackage.scripts?.[name] !== command) errors.push(`root command drift: ${name}`);
  }
  for (const [name, command] of Object.entries(policy.appCommands ?? {})) {
    if (appPackage.scripts?.[name] !== command) errors.push(`app command drift: ${name}`);
  }
  const workspaceDependencies = policy.appWorkspaceDependencies ?? {};
  const expectedDependencies = [
    ...(policy.appDependencies ?? []),
    ...Object.keys(workspaceDependencies),
  ].sort();
  const declaredDependencies = Object.keys(appPackage.dependencies ?? {}).sort();
  if (!arraysEqual(declaredDependencies, expectedDependencies)) {
    errors.push('app dependency closure does not match the layout registry');
  }
  for (const dependency of policy.appDependencies ?? []) {
    if (appPackage.dependencies?.[dependency] !== rootPackage.dependencies?.[dependency]) {
      errors.push(`app dependency version drift: ${dependency}`);
    }
  }
  for (const [dependency, version] of Object.entries(workspaceDependencies)) {
    if (appPackage.dependencies?.[dependency] !== version) {
      errors.push(`app workspace dependency version drift: ${dependency}`);
    }
  }
  const declaredDevDependencies = Object.keys(appPackage.devDependencies ?? {}).sort();
  if (!arraysEqual(declaredDevDependencies, [...(policy.appDevDependencies ?? [])].sort())) {
    errors.push('app development dependency closure does not match the layout registry');
  }
  for (const dependency of policy.appDevDependencies ?? []) {
    const governedVersion =
      rootPackage.devDependencies?.[dependency] ??
      (typeof rootPackage.overrides?.[dependency] === 'string'
        ? rootPackage.overrides[dependency]
        : undefined);
    if (appPackage.devDependencies?.[dependency] !== governedVersion) {
      errors.push(`app development dependency version drift: ${dependency}`);
    }
  }
  return errors;
}

function configSourceErrors(source) {
  if (typeof source !== 'string') return ['Vite config source is missing'];
  const sourceFile = ts.createSourceFile('vite.config.ts', source, ts.ScriptTarget.Latest, true);
  const importsTailwind = sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === '@tailwindcss/vite'
  );
  const config = findViteConfigObject(source);
  const build = findObjectLiteral(unwrapExpression(getProperty(config, 'build')));
  const server = findObjectLiteral(unwrapExpression(getProperty(config, 'server')));
  const fileSystem = findObjectLiteral(unwrapExpression(getProperty(server, 'fs')));
  const checks = [
    [importsTailwind, 'Tailwind Vite plugin import'],
    [hasCall(getProperty(config, 'plugins'), 'tailwindcss'), 'Tailwind Vite plugin call'],
    [
      hasCall(getProperty(config, 'plugins'), 'extensionHtmlInputs', 'BUILD_LAYOUT'),
      'extension HTML input plugin',
    ],
    [normalizedNodeText(getProperty(config, 'root')) === 'BUILD_LAYOUT.appRoot', 'Vite app root'],
    [
      normalizedNodeText(getProperty(build, 'outDir')) === 'BUILD_LAYOUT.outputRoot',
      'Vite output root',
    ],
    [getProperty(build, 'emptyOutDir')?.kind === ts.SyntaxKind.TrueKeyword, 'empty output policy'],
    [
      normalizedNodeText(getProperty(build, 'chunkSizeWarningLimit')) ===
        'layoutPolicy.chunkSizeWarningLimitKb',
      'chunk size warning budget',
    ],
    [getProperty(fileSystem, 'strict')?.kind === ts.SyntaxKind.TrueKeyword, 'strict fs policy'],
    [
      normalizedNodeText(getProperty(fileSystem, 'allow')) ===
        '[BUILD_LAYOUT.appRoot,...BUILD_LAYOUT.externalInputRoots]',
      'bounded Vite fs allowlist',
    ],
  ];
  return checks
    .filter(([passes]) => !passes)
    .map(([, claim]) => `Vite config is missing semantic layout claim: ${claim}`);
}

function styleConfigSourceErrors(tailwindStylesSource) {
  if (typeof tailwindStylesSource !== 'string') return ['Tailwind stylesheet source is missing'];
  let root;
  try {
    root = postcss.parse(tailwindStylesSource);
  } catch {
    return ['Tailwind stylesheet is not valid CSS'];
  }
  const atRules = [];
  root.walkAtRules((rule) => atRules.push([rule.name, rule.params]));
  const declarations = [];
  root.walkDecls((declaration) => declarations.push([declaration.prop, declaration.value]));
  const claims = [
    [
      atRules.some(
        ([name, params]) => name === 'import' && params === "'tailwindcss' source(none)"
      ),
      'bounded Tailwind import',
    ],
    [
      atRules.some(
        ([name, params]) => name === 'source' && params === "'../../../../apps/extension/src'"
      ),
      'extension source root',
    ],
    [atRules.some(([name, params]) => name === 'source' && params === "'..'"), 'UI source root'],
    [atRules.some(([name, params]) => name === 'theme' && params === 'inline'), 'inline theme'],
    [
      declarations.some(
        ([property, value]) =>
          property === 'border-color' && value === 'var(--color-gray-200, currentcolor)'
      ),
      'border compatibility declaration',
    ],
  ];
  return claims
    .filter(([passes]) => !passes)
    .map(([, claim]) => `Tailwind stylesheet is missing semantic ownership claim: ${claim}`);
}

export function extensionBuildLayoutErrors({
  policy,
  rootPackage,
  appPackage,
  viteConfigSource,
  tailwindStylesSource,
  existingPaths = new Set(),
  buildFiles = [],
  retiredFiles = [],
} = {}) {
  return [
    ...policyShapeErrors(policy),
    ...commandAndDependencyErrors(policy, rootPackage, appPackage),
    ...configSourceErrors(viteConfigSource),
    ...styleConfigSourceErrors(tailwindStylesSource),
    ...buildFiles
      .filter((file) => !(policy.configPaths ?? []).includes(file))
      .map((file) => `unregistered app build helper: ${file}`),
    ...(policy.configPaths ?? [])
      .filter((file) => !existingPaths.has(file))
      .map((file) => `required app build config is missing: ${file}`),
    ...(Array.isArray(policy?.htmlInputs) ? policy.htmlInputs : [])
      .map((entry) => entry.sourcePath)
      .filter((file) => !existingPaths.has(file))
      .map((file) => `HTML source input is missing: ${file}`),
    ...(Array.isArray(policy?.manifestModuleInputs) ? policy.manifestModuleInputs : [])
      .map((entry) => entry.sourcePath)
      .filter((file) => !existingPaths.has(file))
      .map((file) => `manifest module input is missing: ${file}`),
    ...retiredFiles.map((file) => `retired root build input remains: ${file}`),
  ];
}
