import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import type { Plugin } from 'vite';
import { isAuthoredI18nCatalogInput } from './injected-build-support.ts';
import { readI18nCatalogs } from '../../../tooling/qa/guards/product-contracts/verify-i18n.catalogs.mjs';
import {
  createI18nProfileSelections,
  flattenCatalog,
  I18N_PROFILE_NAMES,
} from './i18n-profile-selections.ts';

const PREFIX = 'sniptale:i18n/';
const NAMES = ['popup', 'popup-shell', 'content-shim', 'bootstrap'];
const I18N_ROOT = 'apps/extension/src/platform/i18n';
const SUBSETS_PATH = `${I18N_ROOT}/catalog-subsets.ts`;

type PackagedCatalogAsset = { fileName: string; source: string };

/** Generate local data resources without adding any locale messages to startup JavaScript. */
export function createPackagedCatalogs(root: string) {
  const { catalogs, failures } = readI18nCatalogs({ root });
  if (failures.length) throw new Error(failures.join('\n'));
  const english = Object.entries(catalogs).find(([locale]) => locale === 'en')?.[1];
  if (!english) throw new Error('Missing English fallback catalog');
  const { selections, watchFiles } = createI18nProfileSelections(root, english);
  const assets: PackagedCatalogAsset[] = [];
  for (const [locale, catalog] of Object.entries(catalogs)) {
    watchFiles.push(path.join(root, I18N_ROOT, 'catalogs', `${locale}.json`));
    const messages = flattenCatalog(catalog);
    for (const profile of I18N_PROFILE_NAMES) {
      const selected: Record<string, string> = {};
      const selectedKeys = selections[profile];
      if (!selectedKeys) throw new Error(`Missing packaged catalog profile ${profile}`);
      for (const key of selectedKeys) {
        const value = messages[key];
        if (value === undefined) throw new Error(`${locale}: missing packaged catalog key ${key}`);
        selected[key] = value;
      }
      assets.push({
        fileName: `i18n/${profile}/${locale}.json`,
        source: JSON.stringify(selected),
      });
    }
  }
  return { assets, watchFiles: [...new Set(watchFiles)].sort() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSubsetPaths(root: string, name: string): string[] {
  const file = path.join(root, SUBSETS_PATH);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(source) === 'CATALOG_SUBSETS');
  let initializer = declaration?.initializer;
  if (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`${SUBSETS_PATH}: expected a literal CATALOG_SUBSETS object`);
  }
  const property = initializer.properties.find(
    (item) =>
      ts.isPropertyAssignment(item) &&
      (ts.isStringLiteral(item.name) ? item.name.text : item.name.getText(source)) === name
  );
  if (
    !property ||
    !ts.isPropertyAssignment(property) ||
    !ts.isArrayLiteralExpression(property.initializer)
  ) {
    throw new Error(`${SUBSETS_PATH}: missing literal subset ${name}`);
  }
  return property.initializer.elements.map((item) => {
    if (!ts.isStringLiteral(item))
      throw new Error(`${SUBSETS_PATH}: ${name} contains a non-string path`);
    return item.text;
  });
}

/** Materializes one compact catalog without exposing full JSON modules to the runtime graph. */
export function createCatalogProjection(root: string, name: string) {
  if (!NAMES.includes(name)) throw new Error(`Unknown i18n catalog projection: ${name}`);
  const { catalogs, failures } = readI18nCatalogs({ root });
  if (failures.length > 0) throw new Error(failures.join('\n'));
  const paths = readSubsetPaths(root, name);
  const projected: Record<string, Record<string, unknown>> = {};
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (name === 'bootstrap' && locale !== 'en') continue;
    const selected: Record<string, unknown> = {};
    for (const key of paths) {
      const parts = key.split('.');
      let source: unknown = catalog;
      let target = selected;
      for (const [index, part] of parts.entries()) {
        if (!isRecord(source) || !Object.hasOwn(source, part)) {
          throw new Error(`${locale}: missing catalog projection path ${key}`);
        }
        source = source[part];
        if (index === parts.length - 1) target[part] = source;
        else {
          target[part] ??= {};
          const next = target[part];
          if (!isRecord(next)) throw new Error(`Conflicting catalog projection path ${key}`);
          target = next;
        }
      }
    }
    projected[locale] = selected;
  }
  const watchFiles = [SUBSETS_PATH, 'packages/runtime-contracts/src/i18n.ts'].map((file) =>
    path.join(root, file)
  );
  watchFiles.push(
    ...Object.keys(catalogs).map((locale) =>
      path.join(root, I18N_ROOT, 'catalogs', `${locale}.json`)
    )
  );
  return { code: `export const catalogs = ${JSON.stringify(projected)};`, watchFiles };
}

/** Supplies the same compact catalog projections in Vite, development, and Vitest. */
export function i18nCatalogs(root: string): Plugin {
  let packaged: ReturnType<typeof createPackagedCatalogs> | undefined;
  function readPackagedCatalogs() {
    packaged ??= createPackagedCatalogs(root);
    return packaged;
  }
  return {
    name: 'sniptale:i18n-catalogs',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith(PREFIX) && NAMES.includes(id.slice(PREFIX.length))) return `\0${id}`;
    },
    load(id) {
      if (!id.startsWith(`\0${PREFIX}`)) return;
      const { code, watchFiles } = createCatalogProjection(root, id.slice(PREFIX.length + 1));
      for (const file of watchFiles) this.addWatchFile(file);
      return code;
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.moduleIds.some(isAuthoredI18nCatalogInput)) {
          this.error('Startup JavaScript must not import authored translation catalogs');
        }
        if (
          output.type === 'chunk' &&
          output.moduleIds.some(
            (id) => id.startsWith(`\0${PREFIX}`) && id !== `\0${PREFIX}bootstrap`
          )
        ) {
          this.error(
            'Startup JavaScript must use prepared translation data instead of all-language projections'
          );
        }
      }
      const { assets, watchFiles } = readPackagedCatalogs();
      for (const file of watchFiles) this.addWatchFile(file);
      for (const asset of assets) this.emitFile({ type: 'asset', ...asset });
    },
    watchChange() {
      packaged = undefined;
    },
    configureServer(server) {
      // A cold source walk must finish before browser catalog request deadlines start.
      server.watcher.add(readPackagedCatalogs().watchFiles);
      server.middlewares.use('/i18n/', (request, response, next) => {
        const pathname = request.url?.split('?')[0];
        if (!pathname || !/^\/[a-z-]+\/[a-zA-Z0-9-]+\.json$/u.test(pathname)) {
          next();
          return;
        }
        try {
          const { assets, watchFiles } = readPackagedCatalogs();
          server.watcher.add(watchFiles);
          const asset = assets.find((item) => item.fileName === `i18n${pathname}`);
          if (!asset) {
            next();
            return;
          }
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(asset.source);
        } catch (error) {
          next(error);
        }
      });
    },
    handleHotUpdate(context) {
      if (packaged?.watchFiles.includes(context.file)) packaged = undefined;
      if (
        context.file !== path.join(root, SUBSETS_PATH) &&
        context.file !== path.join(root, 'packages/platform/src/i18n/config.ts') &&
        context.file !== path.join(root, 'packages/runtime-contracts/src/i18n.ts') &&
        !context.file.startsWith(path.join(root, I18N_ROOT, 'catalogs') + path.sep)
      )
        return;
      const modules = NAMES.flatMap((name) => {
        const module = context.server.moduleGraph.getModuleById(`\0${PREFIX}${name}`);
        return module ? [module] : [];
      });
      for (const module of modules) context.server.moduleGraph.invalidateModule(module);
      return [...new Set([...context.modules, ...modules])];
    },
  };
}

/** Supplies self-contained projections to the injected content builds. */
export function esbuildI18nCatalogs(root: string): EsbuildPlugin {
  return {
    name: 'sniptale-i18n-catalogs',
    setup(build) {
      build.onResolve({ filter: /^sniptale:i18n\// }, ({ path: id }) => ({
        path: id.slice(PREFIX.length),
        namespace: 'sniptale-i18n',
      }));
      build.onLoad({ filter: /.*/, namespace: 'sniptale-i18n' }, ({ path: name }) => {
        const { code, watchFiles } = createCatalogProjection(root, name);
        return { contents: code, loader: 'js', watchFiles };
      });
    },
  };
}
