import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import type { Plugin } from 'vite';
import { readI18nCatalogs } from '../../../tooling/qa/guards/product-contracts/verify-i18n.catalogs.mjs';

const PREFIX = 'sniptale:i18n/';
const NAMES = ['popup', 'popup-shell', 'content-shim'];
const I18N_ROOT = 'apps/extension/src/platform/i18n';
const SUBSETS_PATH = `${I18N_ROOT}/catalog-subsets.ts`;

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
  const watchFiles = [SUBSETS_PATH, 'packages/platform/src/i18n/config.ts'].map((file) =>
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
    handleHotUpdate(context) {
      if (
        context.file !== path.join(root, SUBSETS_PATH) &&
        context.file !== path.join(root, 'packages/platform/src/i18n/config.ts') &&
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
