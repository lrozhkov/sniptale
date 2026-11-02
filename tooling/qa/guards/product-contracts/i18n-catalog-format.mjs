import ts from 'typescript';

export const I18N_CATALOG_DIRECTORY = 'apps/extension/src/platform/i18n/catalogs';

export function isI18nCatalogPath(file) {
  return /^apps\/extension\/src\/platform\/i18n\/catalogs\/[a-z][a-z0-9-]*\.json$/u.test(file);
}

/** Parse JSON while retaining property order and rejecting duplicate properties. */
export function parseCatalog(text, file = 'catalog.json') {
  JSON.parse(text);
  const source = ts.parseJsonText(file, text);
  const expression = source.statements[0]?.expression;
  function read(node, segments) {
    if (node && ts.isStringLiteral(node)) return { value: node.text };
    if (!node || !ts.isObjectLiteralExpression(node)) {
      throw new Error(`${file}: ${segments.join('.') || '<root>'} must be an object or string`);
    }
    const seen = new Set();
    const entries = node.properties.map((property) => {
      const key = property.name.text;
      if (seen.has(key)) throw new Error(`${file}: duplicate key ${[...segments, key].join('.')}`);
      seen.add(key);
      if (key.includes('.')) throw new Error(`${file}: key segment ${key} must not contain a dot`);
      return { key, node: read(property.initializer, [...segments, key]) };
    });
    return { entries };
  }
  const tree = read(expression, []);
  if (!tree.entries) throw new Error(`${file}: <root> must be an object`);
  return { tree, text, value: catalogValue(tree) };
}

export function catalogValue(node) {
  return node.entries
    ? Object.fromEntries(node.entries.map(({ key, node: child }) => [key, catalogValue(child)]))
    : node.value;
}

/** Compare structure and placeholder names without requiring translated text equality. */
export function validateCatalogShape(tree, template, file = 'catalog.json', segments = []) {
  const location = segments.join('.') || '<root>';
  if (Boolean(tree.entries) !== Boolean(template.entries)) {
    return [`${file}: ${location} has a different object/string shape`];
  }
  if (!template.entries) {
    const parameters = (text) =>
      [
        ...new Set([...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map((match) => match[1])),
      ].sort();
    return JSON.stringify(parameters(tree.value)) === JSON.stringify(parameters(template.value))
      ? []
      : [`${file}: ${location} has different substitution parameters`];
  }
  const actual = new Map(tree.entries.map(({ key, node }) => [key, node]));
  const expected = new Map(template.entries.map(({ key, node }) => [key, node]));
  const failures = [];
  for (const [key, child] of expected) {
    if (!actual.has(key)) failures.push(`${file}: missing key ${[...segments, key].join('.')}`);
    else failures.push(...validateCatalogShape(actual.get(key), child, file, [...segments, key]));
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) failures.push(`${file}: extra key ${[...segments, key].join('.')}`);
  }
  return failures;
}

/** Emit one string entry per physical line in the canonical catalog order. */
export function canonicalCatalogText(tree, template = tree) {
  function emit(node, order, depth) {
    if (!order.entries) return JSON.stringify(node.value);
    const actual = new Map(node.entries.map(({ key, node: child }) => [key, child]));
    const indent = '  '.repeat(depth + 1);
    const entries = order.entries.map(({ key, node: child }) => {
      if (!actual.has(key)) throw new Error(`Cannot format catalog: missing key ${key}`);
      return `${indent}${JSON.stringify(key)}: ${emit(actual.get(key), child, depth + 1)}`;
    });
    return entries.length === 0 ? '{}' : `{\n${entries.join(',\n')}\n${'  '.repeat(depth)}}`;
  }
  return `${emit(tree, template, 0)}\n`;
}
