import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  I18N_CATALOG_DIRECTORY,
  canonicalCatalogText,
  parseCatalog,
  validateCatalogShape,
} from './i18n-catalog-format.mjs';

const LOCALE_CONFIG = 'packages/platform/src/i18n/config.ts';

function readLocaleIds(root) {
  const file = path.join(root, LOCALE_CONFIG);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(
      (item) => item.name.getText(source) === 'LOCALE_REGISTRY'
    );
    if (!declaration) continue;
    let value = declaration.initializer;
    while (
      value &&
      (ts.isAsExpression(value) ||
        ts.isSatisfiesExpression(value) ||
        ts.isParenthesizedExpression(value))
    )
      value = value.expression;
    if (value && ts.isObjectLiteralExpression(value))
      return value.properties.map((property) =>
        property.name.getText(source).replace(/^['"]|['"]$/gu, '')
      );
  }
  throw new Error(`${LOCALE_CONFIG}: cannot read LOCALE_REGISTRY`);
}

/** Read all registered catalogs and validate their structure before returning values. */
export function readI18nCatalogs({ root = process.cwd(), checkFormat = false } = {}) {
  const failures = [];
  const catalogs = {};
  const documents = {};
  try {
    const locales = readLocaleIds(root);
    const directory = path.join(root, I18N_CATALOG_DIRECTORY);
    const files = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
    for (const name of files) {
      if (!locales.some((locale) => name === `${locale}.json`))
        failures.push(`${I18N_CATALOG_DIRECTORY}/${name}: unregistered catalog`);
    }
    for (const locale of locales) {
      const relative = `${I18N_CATALOG_DIRECTORY}/${locale}.json`;
      try {
        const document = parseCatalog(fs.readFileSync(path.join(root, relative), 'utf8'), relative);
        documents[locale] = document;
        catalogs[locale] = document.value;
      } catch (error) {
        failures.push(`${relative}: ${error.message}`);
      }
    }
    const template = documents.en?.tree;
    if (!template)
      failures.push(`${I18N_CATALOG_DIRECTORY}/en.json: canonical English catalog is required`);
    else {
      for (const [locale, document] of Object.entries(documents)) {
        const relative = `${I18N_CATALOG_DIRECTORY}/${locale}.json`;
        const shapeFailures = validateCatalogShape(document.tree, template, relative);
        failures.push(...shapeFailures);
        if (
          checkFormat &&
          shapeFailures.length === 0 &&
          document.text !== canonicalCatalogText(document.tree, template)
        ) {
          failures.push(`${relative}: noncanonical format or key order; run npm run format:write`);
        }
      }
    }
  } catch (error) {
    failures.push(error.message);
  }
  return { catalogs, documents, failures };
}

export function runI18nCatalogCheck(options = {}) {
  return readI18nCatalogs({ ...options, checkFormat: true }).failures;
}

/** Plan every catalog write only after all catalog inputs pass validation. */
export function collectCatalogFormatChanges({ root = process.cwd() } = {}) {
  const { documents, failures } = readI18nCatalogs({ root });
  if (failures.length > 0) throw new Error(failures.join('\n'));
  return Object.entries(documents).flatMap(([locale, document]) => {
    const text = canonicalCatalogText(document.tree, documents.en.tree);
    return text === document.text
      ? []
      : [{ file: `${I18N_CATALOG_DIRECTORY}/${locale}.json`, text }];
  });
}
