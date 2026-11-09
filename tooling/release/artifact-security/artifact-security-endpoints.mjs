import ts from 'typescript';
import { createHash } from 'node:crypto';

const DEVELOPMENT_ENDPOINT = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}/gu;
const LOCAL_PROVIDER_DEFAULTS = new Map([
  ['lm-studio', { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', catalog: 'openai' }],
  ['ollama', { label: 'Ollama', baseUrl: 'http://localhost:11434/api', catalog: 'ollama' }],
]);
// Structural fingerprints cover the SDK factory and its direct dependency roles.
// Binding names are disposable; properties, values, operations and reference identity are not.
const OLLAMA_FACTORY_DIGEST = '6d93bfe657fab7b5ebed5b1773db371f3692f886365126fb09558dc0ff82513e';
const OLLAMA_DEPENDENCY_DIGESTS = new Map([
  ['55431c4d69aee63fcb15701268b4e513a2d444e4101cbdfc758251e495a3d9ab', 'model-error'],
  ['0a82a153dd605695b9757ce9e0352f5e0c7a3509104210aa976db97dac1de017', 'url-normalizer'],
  ['5be52982711a415e03ee7a911670d54f3411493abb276c42d43a4f28b6e96018', 'completion'],
  ['e10360aaff96387ff56c20f8deba225cfdd8e4a28fd1dc441e04d3ab484d8acd', 'embedding'],
  ['20cad813503e2239bccbfffe78941b36936cec22ee8b8b0376e88ae5da39dacf', 'responses'],
]);
const sdkContexts = new WeakMap();

function isFixedIdentifier(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    ((ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
      parent.name === node) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ts.isMetaProperty(parent)
  );
}

function getSdkContext(sourceFile) {
  let context = sdkContexts.get(sourceFile);
  if (context) return context;
  const options = { allowJs: true, noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === sourceFile.fileName ? sourceFile : undefined);
  const program = ts.createProgram([sourceFile.fileName], options, host);
  context = { sourceFile, checker: program.getTypeChecker(), dependencies: new Map() };
  sdkContexts.set(sourceFile, context);
  return context;
}

function directDependency(symbol, context) {
  if (context.dependencies.has(symbol)) return context.dependencies.get(symbol);
  const declaration = symbol.declarations?.find(
    (node) => node.getSourceFile() === context.sourceFile
  );
  let role = null;
  if (
    declaration &&
    (ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration))
  ) {
    const digest = structuralDigest(declaration, context, false);
    role = OLLAMA_DEPENDENCY_DIGESTS.get(digest) ?? null;
  }
  context.dependencies.set(symbol, role);
  return role;
}

function structuralDigest(root, context, resolveDependencies) {
  const locals = new Map();
  const externals = new Map();
  const tokens = [];
  let invalid = false;
  function collect(node) {
    const children = node.getChildren(context.sourceFile);
    if (children.length) {
      children.forEach(collect);
      return;
    }
    let value = node.getText(context.sourceFile);
    if (ts.isIdentifier(node) && !isFixedIdentifier(node)) {
      const symbol = context.checker.getSymbolAtLocation(node);
      if (!symbol) value = `global:${value}`;
      else if (
        symbol.declarations?.some(
          (declaration) => declaration.pos >= root.pos && declaration.end <= root.end
        )
      ) {
        if (!locals.has(symbol)) locals.set(symbol, locals.size);
        value = `local:${locals.get(symbol)}`;
      } else if (resolveDependencies) {
        const role = directDependency(symbol, context);
        if (!role) invalid = true;
        value = `dependency:${role}`;
      } else {
        if (!externals.has(symbol)) externals.set(symbol, externals.size);
        value = `external:${externals.get(symbol)}`;
      }
    }
    tokens.push([node.kind, value]);
  }
  collect(root);
  return invalid ? null : createHash('sha256').update(JSON.stringify(tokens)).digest('hex');
}

function isTextLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function approvedSdkSpan(node, sourceFile) {
  if (!isTextLiteral(node) || node.text !== 'http://127.0.0.1:11434/api') return null;
  let factory = node.parent;
  while (factory && !ts.isFunctionDeclaration(factory)) factory = factory.parent;
  if (!factory) return null;
  const digest = structuralDigest(factory, getSdkContext(sourceFile), true);
  if (digest !== OLLAMA_FACTORY_DIGEST) return null;
  return { start: node.getStart(sourceFile), end: node.end };
}

function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;
}

function isTrue(node) {
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    (ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isNumericLiteral(node.operand) &&
      node.operand.text === '0')
  );
}

function approvedDefaultSpan(node, sourceFile) {
  if (
    !ts.isPropertyAssignment(node) ||
    propertyName(node.name) !== 'baseUrl' ||
    !isTextLiteral(node.initializer)
  )
    return null;
  const descriptor = node.parent;
  const provider = descriptor.parent;
  if (!ts.isObjectLiteralExpression(descriptor) || !ts.isPropertyAssignment(provider)) return null;
  const expected = LOCAL_PROVIDER_DEFAULTS.get(propertyName(provider.name));
  if (!expected || descriptor.properties.length !== 5) return null;
  const fields = new Map();
  for (const field of descriptor.properties) {
    if (!ts.isPropertyAssignment(field)) return null;
    const name = propertyName(field.name);
    if (!name || fields.has(name)) return null;
    fields.set(name, field.initializer);
  }
  for (const [name, value] of Object.entries({ ...expected, credential: 'none' })) {
    const field = fields.get(name);
    if (!field || !isTextLiteral(field) || field.text !== value) return null;
  }
  if (!fields.has('available') || !isTrue(fields.get('available'))) return null;
  return { start: node.initializer.getStart(sourceFile), end: node.initializer.end };
}

/** Admit exact provider defaults and the pinned SDK factory; other endpoint uses still fail. */
export function hasForbiddenDevelopmentEndpoint({ text, sourceFile }) {
  const approved = [];
  function visit(node) {
    const span = approvedDefaultSpan(node, sourceFile) ?? approvedSdkSpan(node, sourceFile);
    if (span) approved.push(span);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...text.matchAll(DEVELOPMENT_ENDPOINT)].some(
    (match) =>
      !approved.some(
        (span) => match.index >= span.start && match.index + match[0].length <= span.end
      )
  );
}
