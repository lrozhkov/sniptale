import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getSourceSnapshot } from '../../../tooling/qa/analysis/source/source-snapshot.mjs';
import { collectFileFailures } from '../../../tooling/qa/guards/product-contracts/verify-i18n.mjs';

const PROFILES = {
  content: { entry: 'content/index.tsx', roots: ['common', 'content', 'aiModal'] },
  'content-shim': {
    entry: 'content/runtime/shim/index.ts',
    roots: ['shared.defaults', 'content.pageLauncher'],
  },
  popup: { entry: 'popup/index.tsx', roots: ['common', 'popup'] },
  'popup-shell': { entry: 'popup/shell/app/index.tsx', roots: ['common', 'popup.tabs'] },
  editor: { entry: 'editor/index.tsx', roots: ['common', 'editor'] },
  gallery: { entry: 'gallery/index.tsx', roots: ['common', 'gallery'] },
  'video-editor': { entry: 'video-editor/index.tsx', roots: ['common', 'videoEditor'] },
  'scenario-editor': { entry: 'scenario-editor/index.tsx', roots: ['common', 'scenario'] },
  settings: { entry: 'settings/index.tsx', roots: ['common', 'settings'] },
  'web-snapshot-viewer': {
    entry: 'web-snapshot-viewer/index.tsx',
    roots: ['common', 'webSnapshotViewer'],
  },
  'camera-recorder': { entry: 'camera-recorder/index.tsx', roots: ['common'] },
  background: { entry: 'background/index.ts', roots: ['background'] },
  offscreen: { entry: 'offscreen/offscreen.ts', roots: ['offscreenExport', 'audioProcessing'] },
  'media-permission': { entry: 'media-permission/index.ts', roots: ['common'] },
  'design-system': { entry: 'design-system/index.tsx', roots: ['common', 'designSystem'] },
} as const;

type CatalogProfile = keyof typeof PROFILES;
type ModuleUsage = { dependencies: string[]; keys: Set<string> };

/** Runtime profiles have packaged data files rather than authored catalog copies. */
export const I18N_PROFILE_NAMES = Object.freeze(Object.keys(PROFILES) as CatalogProfile[]);

/** Flatten validated catalog values without importing their data into runtime JavaScript. */
export function flattenCatalog(catalog: unknown, prefix = '', result: Record<string, string> = {}) {
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('Expected a translation catalog object');
  }
  for (const [name, value] of Object.entries(catalog)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') result[key] = value;
    else flattenCatalog(value, key, result);
  }
  return result;
}

function hasRuntimeModuleEdge(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) {
    return (
      !node.isTypeOnly &&
      (!node.exportClause ||
        !ts.isNamedExports(node.exportClause) ||
        node.exportClause.elements.length === 0 ||
        node.exportClause.elements.some((element) => !element.isTypeOnly))
    );
  }
  const clause = node.importClause;
  return (
    !clause ||
    (!clause.isTypeOnly &&
      (Boolean(clause.name) ||
        !clause.namedBindings ||
        !ts.isNamedImports(clause.namedBindings) ||
        clause.namedBindings.elements.length === 0 ||
        clause.namedBindings.elements.some((element) => !element.isTypeOnly)))
  );
}

function isProductModule(file: string): boolean {
  return (
    (file.startsWith('apps/extension/src/') || /^packages\/[^/]+\/src\//u.test(file)) &&
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/\.d\.[cm]?ts$/u.test(file) &&
    !/(?:\.(?:test|spec|test-support|fixture-content))\.[cm]?[jt]sx?$/u.test(file) &&
    !/(?:^|\/)(?:__tests__|fixtures?)\//u.test(file)
  );
}

function readCompilerOptions(root: string): ts.CompilerOptions {
  const configPath = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const converted = ts.convertCompilerOptionsFromJson(config.config.compilerOptions ?? {}, root);
  const firstError = converted.errors[0];
  if (firstError) throw new Error(ts.flattenDiagnosticMessageText(firstError.messageText, '\n'));
  return converted.options;
}

function createModuleUsageReader(root: string, catalogKeys: Set<string>) {
  const options = readCompilerOptions(root);
  const resolutions = ts.createModuleResolutionCache(root, (file) => file, options);
  const modules = new Map<string, ModuleUsage>();
  const watchFiles = new Set<string>();

  function readModule(relativeFile: string): ModuleUsage {
    const cached = modules.get(relativeFile);
    if (cached) return cached;
    const filePath = path.join(root, relativeFile);
    const text = fs.readFileSync(filePath, 'utf8');
    const source = getSourceSnapshot({ filePath, text }).sourceFile;
    watchFiles.add(filePath);
    const usage = {
      keys: catalogKeys,
      references: new Set<string>(),
      patterns: new Set<string>(),
      unresolved: [] as string[],
    };
    collectFileFailures(relativeFile, { root, usage });
    const result: ModuleUsage = { dependencies: [], keys: usage.references };
    modules.set(relativeFile, result);

    function dependency(specifier: string) {
      if (specifier.startsWith('sniptale:')) return;
      const resolved = ts.resolveModuleName(
        specifier.split('?')[0] ?? specifier,
        filePath,
        options,
        ts.sys,
        resolutions
      ).resolvedModule;
      if (!resolved) return;
      const canonical = fs.realpathSync(resolved.resolvedFileName);
      const relative = path.relative(root, canonical).split(path.sep).join('/');
      if (isProductModule(relative)) result.dependencies.push(relative);
    }

    function visit(node: ts.Node) {
      // The copy guard excludes contract and persistence owners. Their literal keys still
      // contribute when a production runtime reaches those modules.
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (catalogKeys.has(node.text)) result.keys.add(node.text);
      } else if (ts.isTemplateExpression(node) && node.head.text.includes('.')) {
        usage.patterns.add(
          JSON.stringify([node.head.text, node.templateSpans.at(-1)?.literal.text ?? ''])
        );
      }
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        hasRuntimeModuleEdge(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        dependency(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        (ts.isStringLiteral(node.arguments[0]) ||
          ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
      ) {
        dependency(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const encoded of usage.patterns) {
      const pattern: unknown = JSON.parse(encoded);
      if (
        !Array.isArray(pattern) ||
        pattern.length !== 2 ||
        typeof pattern[0] !== 'string' ||
        typeof pattern[1] !== 'string'
      ) {
        throw new Error('Invalid translation usage pattern');
      }
      const [prefix, suffix] = pattern;
      for (const key of catalogKeys) {
        if (key.startsWith(prefix) && key.endsWith(suffix)) result.keys.add(key);
      }
    }
    result.dependencies = [...new Set(result.dependencies)];
    return result;
  }

  return { readModule, watchFiles };
}

/** Select owned message domains and exact reachable cross-owner keys once for every locale. */
export function createI18nProfileSelections(root: string, englishCatalog: unknown) {
  const keys = new Set(Object.keys(flattenCatalog(englishCatalog)));
  const { readModule, watchFiles } = createModuleUsageReader(root, keys);
  const selections: Record<string, readonly string[]> = {};
  for (const name of I18N_PROFILE_NAMES) {
    const definition = PROFILES[name];
    const selected = new Set(
      [...keys].filter((key) =>
        definition.roots.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))
      )
    );
    // Tiny startup surfaces have explicit message selections. Their loader dependencies
    // must not pull the full popup or content dictionaries into their data package.
    if (name !== 'content-shim' && name !== 'popup-shell') {
      const pending = [`apps/extension/src/${definition.entry}`];
      const visited = new Set<string>();
      while (pending.length) {
        const relativeFile = pending.pop();
        if (!relativeFile || visited.has(relativeFile)) continue;
        visited.add(relativeFile);
        const usage = readModule(relativeFile);
        for (const key of usage.keys) selected.add(key);
        pending.push(...usage.dependencies);
      }
    }
    selections[name] = [...selected].sort();
  }
  for (const config of ['tsconfig.json', 'packages/runtime-contracts/src/i18n.ts']) {
    const file = path.join(root, config);
    if (fs.existsSync(file)) watchFiles.add(file);
  }
  for (const name of ['foundation', 'platform', 'runtime-contracts', 'ui']) {
    const file = path.join(root, 'packages', name, 'package.json');
    if (fs.existsSync(file)) watchFiles.add(file);
  }
  return { selections, watchFiles: [...watchFiles].sort() };
}
