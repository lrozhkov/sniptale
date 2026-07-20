import { posix } from 'node:path';

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

function policyShapeErrors(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) errors.push('layout schema must be version 1');
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
  const outputPaths = policy?.htmlInputs?.map((entry) => entry.outputPath) ?? [];
  if (new Set(outputPaths).size !== outputPaths.length) {
    errors.push('HTML output paths must be unique');
  }
  for (const entry of policy?.htmlInputs ?? []) {
    if (!isDeclaredExtensionBuildInput(entry.sourcePath, policy)) {
      errors.push(`undeclared HTML source input: ${entry.sourcePath}`);
    }
  }
  const manifestVirtualPaths =
    policy?.manifestModuleInputs?.map((entry) => entry.virtualPath) ?? [];
  if (new Set(manifestVirtualPaths).size !== manifestVirtualPaths.length) {
    errors.push('manifest module virtual paths must be unique');
  }
  for (const entry of policy?.manifestModuleInputs ?? []) {
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
  const requiredMarkers = [
    'root: BUILD_LAYOUT.appRoot',
    'outDir: BUILD_LAYOUT.outputRoot',
    'emptyOutDir: true',
    'strict: true',
    'allow: [BUILD_LAYOUT.appRoot, ...BUILD_LAYOUT.externalInputRoots]',
    'extensionHtmlInputs(BUILD_LAYOUT)',
  ];
  return requiredMarkers
    .filter((marker) => !source.includes(marker))
    .map((marker) => `Vite config is missing layout marker: ${marker}`);
}

function styleConfigSourceErrors(postcssSource, tailwindSource) {
  const errors = [];
  for (const marker of [
    "import tailwindConfig from './tailwind.config.js'",
    'tailwindcss: tailwindConfig',
  ]) {
    if (!postcssSource.includes(marker)) {
      errors.push(`PostCSS config is missing Tailwind ownership marker: ${marker}`);
    }
  }
  for (const marker of [
    "fileURLToPath(new URL('.', import.meta.url))",
    "resolve(APP_ROOT, 'src/**/*.{js,jsx,ts,tsx}')",
    "resolve(APP_ROOT, '../../packages/ui/src/**/*.{js,jsx,ts,tsx}')",
  ]) {
    if (!tailwindSource.includes(marker)) {
      errors.push(`Tailwind config is missing bounded content marker: ${marker}`);
    }
  }
  return errors;
}

export function extensionBuildLayoutErrors({
  policy,
  rootPackage,
  appPackage,
  viteConfigSource,
  postcssConfigSource,
  tailwindConfigSource,
  existingPaths = new Set(),
  retiredFiles = [],
} = {}) {
  return [
    ...policyShapeErrors(policy),
    ...commandAndDependencyErrors(policy, rootPackage, appPackage),
    ...configSourceErrors(viteConfigSource),
    ...styleConfigSourceErrors(postcssConfigSource, tailwindConfigSource),
    ...(policy.configPaths ?? [])
      .filter((file) => !existingPaths.has(file))
      .map((file) => `required app build config is missing: ${file}`),
    ...(policy.htmlInputs ?? [])
      .map((entry) => entry.sourcePath)
      .filter((file) => !existingPaths.has(file))
      .map((file) => `HTML source input is missing: ${file}`),
    ...(policy.manifestModuleInputs ?? [])
      .map((entry) => entry.sourcePath)
      .filter((file) => !existingPaths.has(file))
      .map((file) => `manifest module input is missing: ${file}`),
    ...retiredFiles.map((file) => `retired root build input remains: ${file}`),
  ];
}
